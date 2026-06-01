#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const ejs = require('ejs');

const rootDir = path.resolve(__dirname, '..');

const walk = (dir, predicate) => {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(fullPath, predicate);
    }
    return predicate(fullPath) ? [fullPath] : [];
  });
};

const relative = (filePath) => path.relative(rootDir, filePath);

const checkJavaScript = (filePath) => {
  const result = spawnSync(process.execPath, ['--check', filePath], {
    cwd: rootDir,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error([
      `JavaScript syntax check failed: ${relative(filePath)}`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join('\n'));
  }
};

const compileTemplate = (filePath) => {
  ejs.compile(fs.readFileSync(filePath, 'utf8'), { filename: filePath });
};

const renderTemplate = (filePath, locals) => (
  ejs.render(fs.readFileSync(filePath, 'utf8'), locals, { filename: filePath })
);

const verifyAdminLayoutScriptSlot = () => {
  const adminViewDir = path.join(rootDir, 'src/views/admin');
  const layoutPath = path.join(rootDir, 'src/views/layouts/admin.ejs');
  const layoutSource = fs.readFileSync(layoutPath, 'utf8');
  const serverSource = fs.readFileSync(path.join(rootDir, 'src/server.js'), 'utf8');
  const adminViewsWithScripts = walk(adminViewDir, (filePath) => {
    if (!filePath.endsWith('.ejs')) return false;
    const source = fs.readFileSync(filePath, 'utf8');
    return /<script[\s>]/.test(source);
  });

  if (adminViewsWithScripts.length > 0 && !/<%-\s*script\s*%>/.test(layoutSource)) {
    throw new Error(
      'Admin layout must render <%- script %> because express-ejs-layouts extracts inline scripts from admin views.'
    );
  }
  if (!/layout extractScripts['"], true/.test(serverSource) || /typeof script/.test(layoutSource)) {
    throw new Error('Admin layout must rely on express-ejs-layouts script extraction instead of fallback-checking script locals.');
  }
  if (/typeof scripts|scripts\.forEach/.test(layoutSource)) {
    throw new Error('Admin layout must not keep an unused custom scripts array slot; express-ejs-layouts provides script.');
  }
  if (/layout extractStyles['"], true/.test(serverSource) && !/<%-\s*style\s*%>/.test(layoutSource)) {
    throw new Error('Admin layout must not enable express-ejs-layouts style extraction without rendering <%- style %>.');
  }

  const directSocketViews = adminViewsWithScripts.filter((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    return /\b(?:const|let|var)\s+socket\s*=\s*io\(\s*\)/.test(source);
  });

  if (directSocketViews.length > 0) {
    throw new Error(
      `Admin views must use the shared admin socket event bridge instead of creating another socket: ${directSocketViews.map(relative).join(', ')}`
    );
  }

  const footerSource = fs.readFileSync(path.join(rootDir, 'src/views/partials/footer.ejs'), 'utf8');
  const navbarSource = fs.readFileSync(path.join(rootDir, 'src/views/partials/navbar.ejs'), 'utf8');
  const adminJsSource = fs.readFileSync(path.join(rootDir, 'public/js/admin.js'), 'utf8');
  const dashboardSource = fs.readFileSync(path.join(rootDir, 'src/views/admin/dashboard.ejs'), 'utf8');
  const statisticsSource = fs.readFileSync(path.join(rootDir, 'src/views/admin/statistics.ejs'), 'utf8');
  const sidebarSource = fs.readFileSync(path.join(rootDir, 'src/views/partials/sidebar.ejs'), 'utf8');
  const publicOrderControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/public/order.controller.js'), 'utf8');
  const adminOrderControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/admin/order.controller.js'), 'utf8');
  if (/^\s*(?:let|const|var)\s+adminSocket\s*;/m.test(adminJsSource)) {
    throw new Error('public/js/admin.js must not keep unused global adminSocket state; DOMContentLoaded owns the local socket.');
  }
  if (/^let notificationCount = 0;$/m.test(adminJsSource) || !/document\.addEventListener\('DOMContentLoaded', function\(\) \{\s*let notificationCount = 0;[\s\S]*const adminSocket = io\(\);/.test(adminJsSource)) {
    throw new Error('public/js/admin.js must keep notification count state local to the DOMContentLoaded startup scope.');
  }
  if (/window\.aioskAdminSocket/.test(adminJsSource)) {
    throw new Error('public/js/admin.js must not expose the Socket.IO instance on window; the layout loads the script once and local handlers own it.');
  }
  if (/function\s+initializeSocket|initializeSocket\(/.test(adminJsSource)) {
    throw new Error('public/js/admin.js must not keep a single-use initializeSocket helper; DOMContentLoaded owns Socket.IO registration directly.');
  }
  if (/function\s+initializeApp|initializeApp\(/.test(adminJsSource)) {
    throw new Error('public/js/admin.js must not keep a single-use initializeApp helper; DOMContentLoaded owns startup directly.');
  }
  if (/typeof\s+io\s*!==\s*['"]undefined['"]/.test(adminJsSource)) {
    throw new Error('public/js/admin.js must not hide missing Socket.IO client assets; the admin layout loads /socket.io/socket.io.js before the shared script.');
  }
  if (!/<script src="\/socket\.io\/socket\.io\.js"><\/script>[\s\S]*<script src="\/js\/admin\.js"><\/script>/.test(layoutSource)) {
    throw new Error('Admin layout must load the Socket.IO client before public/js/admin.js.');
  }
  if (/querySelectorAll\('[^']+'\)[\s\S]*?forEach\(element => \{[\s\S]*?if \(element\)/.test(adminJsSource)) {
    throw new Error('public/js/admin.js must not null-check elements yielded by querySelectorAll().');
  }
  if (/<script[\s>]/.test(footerSource) || /setInterval\(updateTime, 1000\)/.test(footerSource)) {
    throw new Error('Admin footer must not carry a duplicate inline clock script; public/js/admin.js owns the shared clock.');
  }
  if (!/id="currentTime"/.test(footerSource) || !/<%- include\('\.\.\/partials\/footer'\) %>[\s\S]*<script src="\/js\/admin\.js"><\/script>/.test(layoutSource)) {
    throw new Error('Admin layout must render the currentTime footer element before loading public/js/admin.js.');
  }
  if (/function\s+startClock|startClock\(|function\s+updateTime/.test(adminJsSource)) {
    throw new Error('public/js/admin.js must not keep a single-use global clock helper; DOMContentLoaded owns currentTime updates directly.');
  }
  const viewSources = walk(path.join(rootDir, 'src/views'), (filePath) => filePath.endsWith('.ejs'))
    .map(filePath => fs.readFileSync(filePath, 'utf8'))
    .join('\n');
  if (!/data-bs-toggle=["']tooltip["']/.test(viewSources) && /initializeTooltips|new bootstrap\.Tooltip/.test(adminJsSource)) {
    throw new Error('admin.js must not keep dead Bootstrap tooltip initialization when no admin view renders tooltips.');
  }
  if (/orderCountBadge/.test(sidebarSource) && !/orderCountBadge/.test(adminJsSource)) {
    throw new Error('Admin sidebar must not render a stale orderCountBadge when no shared admin JS updates it.');
  }
  if (/id=["'](?:notificationDropdown|adminDropdown)["']/.test(navbarSource)) {
    throw new Error('Admin navbar must not keep unreferenced dropdown anchor ids; Bootstrap uses data-bs-toggle for these menus.');
  }
  if (!/<%- include\('\.\.\/partials\/navbar'\) %>/.test(layoutSource) || !/<script src="\/js\/admin\.js"><\/script>/.test(layoutSource)) {
    throw new Error('Admin layout must load public/js/admin.js only with the navbar that owns shared notification DOM.');
  }
  if (!/id="notificationBadge"/.test(navbarSource) || !/id="notificationList"/.test(navbarSource)) {
    throw new Error('Admin navbar must keep the shared notification DOM IDs used by public/js/admin.js.');
  }
  if (/const badge = document\.getElementById\('notificationBadge'\);\s*if \(badge\)/.test(adminJsSource) || /const notificationList = document\.getElementById\('notificationList'\);\s*if \(notificationList\)/.test(adminJsSource)) {
    throw new Error('public/js/admin.js must not null-guard notification DOM that the admin layout always renders with the script.');
  }
  if (/function\s+(?:initializeNotifications|updateNotificationBadge)|\b(?:initializeNotifications|updateNotificationBadge)\(/.test(adminJsSource)) {
    throw new Error('public/js/admin.js must not keep single-use notification init/badge helpers; DOMContentLoaded and the new-order handler own those operations directly.');
  }
  if (/function\s+setupKeyboardShortcuts|setupKeyboardShortcuts\(/.test(adminJsSource)) {
    throw new Error('public/js/admin.js must not keep a single-use setupKeyboardShortcuts helper; DOMContentLoaded owns keyboard shortcut registration directly.');
  }
  if (/function\s+addNotificationToList|addNotificationToList\(/.test(adminJsSource)) {
    throw new Error('public/js/admin.js must not keep a single-use addNotificationToList helper; the new-order handler owns navbar notification insertion.');
  }
  if (/function\s+playNotificationSound|playNotificationSound\(/.test(adminJsSource)) {
    throw new Error('public/js/admin.js must not keep a single-use playNotificationSound helper; the new-order handler owns optional sound playback.');
  }
  if (/function\s+handleNewOrderNotification|handleNewOrderNotification\(/.test(adminJsSource)) {
    throw new Error('public/js/admin.js must not keep a single-use handleNewOrderNotification helper; the new_order callback owns notification handling directly.');
  }
  const domContentLoadedStart = adminJsSource.indexOf("document.addEventListener('DOMContentLoaded', function() {");
  const showAlertStart = adminJsSource.indexOf('const showAlert = (message, type) => {');
  const startupSource = domContentLoadedStart >= 0 && showAlertStart > domContentLoadedStart
    ? adminJsSource.slice(domContentLoadedStart, showAlertStart)
    : '';
  if (
    /^function\s+(?:updateConnectionStatus|handleOrderStatusChange)\(/m.test(adminJsSource) ||
    /querySelectorAll\('#connectionStatus'\)/.test(startupSource) ||
    !/const updateConnectionStatus = \(isConnected\) => \{[\s\S]*const statusElement = document\.getElementById\('connectionStatus'\);[\s\S]*if \(!statusElement\) return;[\s\S]*statusElement\.textContent = isConnected \? '연결됨' : '연결 끊김';[\s\S]*statusElement\.className = isConnected \? 'h6 text-success' : 'h6 text-danger';[\s\S]*\};/.test(startupSource) ||
    !/const handleOrderStatusChange = \(data\) => \{[\s\S]*window\.location\.pathname === '\/admin\/orders'[\s\S]*document\.getElementById\(`status-\$\{data\.orderId\}`\)[\s\S]*'CANCELLED': '취소'[\s\S]*statusElement\.className = `badge bg-\$\{statusColors\[data\.status\]\}`;[\s\S]*\};/.test(startupSource)
  ) {
    throw new Error('public/js/admin.js must keep connection/order status helpers local to the DOMContentLoaded startup scope and update the single connectionStatus element directly.');
  }
  if (!/document\.addEventListener\('DOMContentLoaded', function\(\) \{[\s\S]*Notification\.permission === 'default'[\s\S]*Notification\.requestPermission\(\);/.test(adminJsSource)) {
    throw new Error('public/js/admin.js must keep browser notification permission setup in the DOMContentLoaded startup path.');
  }
  if (
    !/const adminSocket = io\(\);/.test(startupSource) ||
    !/adminSocket\.on\('connect', function\(\) \{[\s\S]*updateConnectionStatus\(true\);[\s\S]*\}\);/.test(startupSource) ||
    !/adminSocket\.on\('disconnect', function\(\) \{[\s\S]*updateConnectionStatus\(false\);[\s\S]*\}\);/.test(startupSource) ||
    !/adminSocket\.on\('new_order', function\(orderData\) \{[\s\S]*const orderId = String\(orderData\.orderId\)\.padStart\(4, '0'\);[\s\S]*notificationCount\+\+;[\s\S]*new Notification\('새 주문 접수'[\s\S]*CustomEvent\('aiosk:new-order', \{ detail: orderData \}\)/.test(startupSource) ||
    !/adminSocket\.on\('order_status_updated', function\(data\) \{[\s\S]*handleOrderStatusChange\(data\);[\s\S]*CustomEvent\('aiosk:order-status-updated', \{ detail: data \}\)/.test(startupSource) ||
    !/adminSocket\.on\('order_cancelled', function\(data\) \{[\s\S]*handleOrderStatusChange\(data\);[\s\S]*CustomEvent\('aiosk:order-cancelled', \{ detail: data \}\)/.test(startupSource)
  ) {
    throw new Error('public/js/admin.js DOMContentLoaded startup path must register Socket.IO admin events directly after pruning initializeSocket.');
  }
  if (
    /querySelectorAll\('#currentTime'\)/.test(startupSource) ||
    !/const timeElement = document\.getElementById\('currentTime'\);[\s\S]*const updateCurrentTime = \(\) => \{[\s\S]*timeElement\.textContent = ` - \$\{timeString\}`;[\s\S]*updateCurrentTime\(\);[\s\S]*setInterval\(updateCurrentTime, 1000\);/.test(startupSource)
  ) {
    throw new Error('public/js/admin.js DOMContentLoaded startup path must own the single currentTime element update directly after pruning startClock.');
  }
  if (
    !/document\.addEventListener\('keydown', function\(event\)/.test(startupSource) ||
    !/event\.ctrlKey && event\.key === 'r'[\s\S]*location\.reload\(\);/.test(startupSource) ||
    !/event\.ctrlKey && event\.key === 'd'[\s\S]*window\.location\.href = '\/admin';/.test(startupSource) ||
    !/event\.ctrlKey && event\.key === 'o'[\s\S]*window\.location\.href = '\/admin\/orders';/.test(startupSource) ||
    !/event\.ctrlKey && event\.key === 'm'[\s\S]*window\.location\.href = '\/admin\/menus';/.test(startupSource)
  ) {
    throw new Error('public/js/admin.js DOMContentLoaded startup path must register admin keyboard shortcuts directly after pruning setupKeyboardShortcuts.');
  }
  if (!/notificationCount\+\+;[\s\S]*const badge = document\.getElementById\('notificationBadge'\);[\s\S]*badge\.textContent = notificationCount;[\s\S]*badge\.style\.display = 'block';/.test(adminJsSource)) {
    throw new Error('public/js/admin.js new-order handler must update the navbar notification badge directly after pruning updateNotificationBadge.');
  }
  if (!/const notificationList = document\.getElementById\('notificationList'\);[\s\S]*escapeHtml\(`새 주문 #\$\{orderId\} \(\$\{orderData\.totalPrice\.toLocaleString\(\)\}원\)`\)[\s\S]*escapeHtml\(new Date\(\)\.toLocaleTimeString\('ko-KR'\)\)[\s\S]*notificationList\.insertAdjacentHTML\('beforeend', notificationHtml\)/.test(adminJsSource)) {
    throw new Error('public/js/admin.js new-order handler must insert escaped navbar notification markup directly after pruning addNotificationToList.');
  }
  if (!/let audioContext = null;[\s\S]*const AudioContextClass = window\.AudioContext \|\| window\.webkitAudioContext;[\s\S]*if \(AudioContextClass\) \{[\s\S]*audioContext = new AudioContextClass\(\);[\s\S]*oscillator\.frequency\.setValueAtTime\(800, audioContext\.currentTime\);[\s\S]*oscillator\.addEventListener\('ended', function\(\) \{[\s\S]*if \(audioContext\.state === 'closed'\) return;[\s\S]*audioContext\.close\(\)\.catch\(function\(\) \{[\s\S]*Audio cleanup is best-effort after notification playback\.[\s\S]*\}, \{ once: true \}\);[\s\S]*oscillator\.stop\(audioContext\.currentTime \+ 0\.3\);[\s\S]*if \(audioContext && audioContext\.state !== 'closed'\) \{[\s\S]*audioContext\.close\(\)\.catch\(function\(\) \{[\s\S]*Audio cleanup is best-effort after failed notification playback\.[\s\S]*Notification sound is optional and may be blocked by browser policy/.test(adminJsSource)) {
    throw new Error('public/js/admin.js new-order handler must keep optional Web Audio notification playback and close the AudioContext after playback or playback setup failures.');
  }
  if (/const container = document\.querySelector\('\.container-fluid'\);\s*if \(container\)/.test(adminJsSource) || /const alert = container\.querySelector\('\.alert'\);\s*if \(alert\)/.test(adminJsSource)) {
    throw new Error('public/js/admin.js must not null-guard alert DOM that the admin layout and inserted alert markup always provide.');
  }
  if (/chart\.js/.test(layoutSource) || !/\/vendor\/chart\.js\/chart\.umd\.js[\s\S]*new Chart/.test(dashboardSource) || !/\/vendor\/chart\.js\/chart\.umd\.js[\s\S]*new Chart/.test(statisticsSource)) {
    throw new Error('Admin layout must not load Chart.js globally; only dashboard/statistics views should load the local Chart.js asset before chart initialization.');
  }
  const newOrderEmitBlock = (publicOrderControllerSource.match(/io\.emit\('new_order', \{[\s\S]*?\n\s*\}\);/) || [''])[0];
  if (!/orderId:\s*publicOrderResponse\.orderId/.test(newOrderEmitBlock) || !/totalPrice:\s*publicOrderResponse\.totalPrice/.test(newOrderEmitBlock)) {
    throw new Error('Public order controller must emit normalized orderId/totalPrice fields consumed by the admin new-order UI.');
  }
  if (/\b(status|createdAt|items):/.test(newOrderEmitBlock)) {
    throw new Error('new_order Socket.IO payload must not carry fields unused by the admin notification/dashboard listeners.');
  }
  if (/\borderData\.id\b/.test(adminJsSource) || /\borderData\.id\b/.test(dashboardSource)) {
    throw new Error('Admin new_order consumers must not keep the legacy orderData.id fallback; the event contract is orderId/totalPrice.');
  }
  if (/Number\(orderData\.totalPrice\)/.test(adminJsSource) || /Number\(orderData\.totalPrice\)/.test(dashboardSource)) {
    throw new Error('Admin new_order consumers must not re-coerce totalPrice already normalized by the public order controller.');
  }
  if (/function\s+showBrowserNotification|showBrowserNotification\(/.test(adminJsSource)) {
    throw new Error('admin.js must not keep the single-use showBrowserNotification global helper; inline the browser notification in the new-order handler.');
  }
  if (!/new Notification\('새 주문 접수', \{[\s\S]*body:\s*`주문번호 #\$\{orderId\}`[\s\S]*icon:\s*'\/favicon\.svg'[\s\S]*badge:\s*'\/favicon\.svg'/.test(adminJsSource)) {
    throw new Error('admin.js new-order handler must keep the browser notification contract after pruning showBrowserNotification.');
  }
  const orderStatusEmitBlock = (adminOrderControllerSource.match(/io\.emit\('order_status_updated', \{[\s\S]*?\n      \}\);/) || [''])[0];
  if (!/orderId:\s*result\.orderId/.test(orderStatusEmitBlock) || !/previousStatus:\s*result\.previousStatus/.test(orderStatusEmitBlock) || !/status:\s*result\.status/.test(orderStatusEmitBlock)) {
    throw new Error('Admin order_status_updated Socket.IO payload must emit the fields consumed by the admin UI.');
  }
  if (/message:/.test(orderStatusEmitBlock)) {
    throw new Error('Admin order_status_updated Socket.IO payload must not carry fields unused by the admin UI.');
  }
  const orderCancelledEmitBlock = (adminOrderControllerSource.match(/io\.emit\('order_cancelled', \{[\s\S]*?\n      \}\);/) || [''])[0];
  if (!/orderId:\s*result\.orderId/.test(orderCancelledEmitBlock) || !/previousStatus:\s*result\.previousStatus/.test(orderCancelledEmitBlock) || !/status:\s*result\.status/.test(orderCancelledEmitBlock)) {
    throw new Error('Admin order_cancelled Socket.IO payload must emit the fields consumed by the admin UI.');
  }
  if (/message:/.test(orderCancelledEmitBlock)) {
    throw new Error('Admin order_cancelled Socket.IO payload must not carry fields unused by the admin UI.');
  }

  console.log('ok admin layout script slot');
};

const verifyNoTemporaryRuntimeMarkers = () => {
  const checkedFiles = [
    path.join(rootDir, 'src/server.js'),
    path.join(rootDir, 'scripts/e2e-db-api.js')
  ];
  const forbiddenPatterns = [
    /변경사항 테스트용/,
    /변경사항 적용됨/,
    /AIOSK Backend API is running/
  ];

  for (const filePath of checkedFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    const forbiddenPattern = forbiddenPatterns.find(pattern => pattern.test(source));
    if (forbiddenPattern) {
      throw new Error(`Temporary runtime marker remains in ${relative(filePath)}: ${forbiddenPattern}`);
    }
  }

  console.log('ok no temporary runtime markers');
};

const verifyNoDeadExampleEnvKeys = () => {
  const exampleEnvFiles = [
    '.env.example',
    '.env.docker.example',
    '.env.production.example',
    'frontend/.env.example'
  ];
  const forbiddenKeys = [
    'API_DOCS_ENABLED',
    'API_DOCS_PATH',
    'ENABLE_CORS',
    'ENABLE_PERFORMANCE_MONITORING',
    'SLOW_QUERY_THRESHOLD',
    'SECURITY_LOGGING'
  ];

  exampleEnvFiles.forEach((file) => {
    const source = fs.readFileSync(path.join(rootDir, file), 'utf8');
    const staleKeys = forbiddenKeys.filter((key) => new RegExp(`^#?\\s*${key}=`, 'm').test(source));

    if (staleKeys.length > 0) {
      throw new Error(`${file} contains unsupported environment keys: ${staleKeys.join(', ')}`);
    }
  });

  console.log('ok no dead example env keys');
};

const verifyLoggingEnvContract = () => {
  const envFiles = [
    '.env.example',
    '.env.docker.example',
    '.env.production.example'
  ];

  envFiles.forEach((file) => {
    const source = fs.readFileSync(path.join(rootDir, file), 'utf8');
    if (!/^LOG_LEVEL=info$/m.test(source) || !/^LOG_DIR=logs$/m.test(source)) {
      throw new Error(`${file} must declare the live logging runtime configuration.`);
    }
  });

  [
    'docker-compose.yml',
    'docker-compose.prod.yml'
  ].forEach((file) => {
    const source = fs.readFileSync(path.join(rootDir, file), 'utf8');
    if (!/LOG_LEVEL:\s*\$\{LOG_LEVEL:-info\}/.test(source) || !/LOG_DIR:\s*\$\{LOG_DIR:-logs\}/.test(source)) {
      throw new Error(`${file} must pass LOG_LEVEL and LOG_DIR into the backend container.`);
    }
  });

  const runbookSource = fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8');
  if (!/LOG_LEVEL=info\s+LOG_DIR=logs\s+READINESS_DB_TIMEOUT_MS=2000/.test(runbookSource)) {
    throw new Error('OPERATIONS_RUNBOOK.md must document LOG_DIR with the production runtime env contract.');
  }

  console.log('ok logging env contract');
};

const verifyNoTrackedRuntimeArtifacts = () => {
  const gitignoreSource = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf8');
  const frontendGitignoreSource = fs.readFileSync(path.join(rootDir, 'frontend/.gitignore'), 'utf8');
  [
    ['default local env file', /^\.env$/m, gitignoreSource],
    ['local env file variants', /^\.env\.\*$/m, gitignoreSource],
    ['env example allowlist', /^!\.env\.example$/m, gitignoreSource],
    ['docker env example allowlist', /^!\.env\.docker\.example$/m, gitignoreSource],
    ['production env example allowlist', /^!\.env\.production\.example$/m, gitignoreSource],
    ['runtime upload directory', /^uploads\/$/m, gitignoreSource],
    ['runtime log directory', /^logs\/$/m, gitignoreSource],
    ['database backup directory', /^backups\/$/m, gitignoreSource],
    ['history snapshots', /^\.history\/$/m, gitignoreSource],
    ['cookie scratch file', /^cookies\.txt$/m, gitignoreSource],
    ['log files', /^\*\.log$/m, gitignoreSource],
    ['frontend default local env file', /^\.env$/m, frontendGitignoreSource],
    ['frontend local env file variants', /^\.env\.\*$/m, frontendGitignoreSource],
    ['frontend env example allowlist', /^!\.env\.example$/m, frontendGitignoreSource],
    ['frontend build output', /^dist$/m, frontendGitignoreSource],
    ['frontend SSR build output', /^dist-ssr$/m, frontendGitignoreSource]
  ].forEach(([label, pattern, source]) => {
    if (!pattern.test(source)) {
      throw new Error(`.gitignore must ignore ${label}.`);
    }
  });

  [
    ['root default env file', '.env', true],
    ['root local env variant', '.env.local', true],
    ['root production env file', '.env.production', true],
    ['editor history snapshot', '.history/editor-snapshot.md', true],
    ['cookie scratch file', 'cookies.txt', true],
    ['root env example', '.env.example', false],
    ['root docker env example', '.env.docker.example', false],
    ['root production env example', '.env.production.example', false],
    ['frontend local env variant', 'frontend/.env.local', true],
    ['frontend env example', 'frontend/.env.example', false]
  ].forEach(([label, filePath, shouldBeIgnored]) => {
    const result = spawnSync('git', ['check-ignore', '--no-index', '-q', filePath], {
      cwd: rootDir,
      encoding: 'utf8'
    });
    if (result.status !== (shouldBeIgnored ? 0 : 1)) {
      throw new Error(`.gitignore must ${shouldBeIgnored ? 'ignore' : 'allow'} ${label}.`);
    }
  });

  const result = spawnSync('git', [
    'ls-files',
    '--',
    '.env',
    '.env.*',
    'frontend/.env',
    'frontend/.env.*',
    'uploads',
    'logs',
    'backups',
    '.history',
    'cookies.txt',
    'dist',
    'frontend/dist',
    '*.log',
    '*.sql.gz',
    '*.tgz'
  ], {
    cwd: rootDir,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error(`Unable to inspect tracked runtime artifact files:\n${result.stdout}\n${result.stderr}`);
  }

  const allowedTrackedEnvExamples = new Set([
    '.env.example',
    '.env.docker.example',
    '.env.production.example',
    'frontend/.env.example'
  ]);
  const trackedExistingArtifacts = result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((filePath) => fs.existsSync(path.join(rootDir, filePath)))
    .filter((filePath) => !allowedTrackedEnvExamples.has(filePath));

  if (trackedExistingArtifacts.length > 0) {
    throw new Error(`Runtime/generated/local env artifacts must not be tracked: ${trackedExistingArtifacts.join(', ')}`);
  }

  console.log('ok no tracked runtime artifacts');
};

const verifyPrunedArtifactsAbsent = () => {
  const prunedPaths = [
    'FRONTEND_DEVELOPMENT_PLAN.md',
    'QUICK_TEST_GUIDE.md',
    'TROUBLESHOOTING_ORDER.md',
    'api_documentation_index.html',
    'test_order_management.html',
    'test_statistics_dashboard.html',
    'test_upload.html',
    'frontend/test-frontend.sh',
    'frontend/test-order-flow.sh',
    'frontend/public/vite.svg',
    'frontend/src/assets/react.svg',
    'frontend/src/App.css',
    'frontend/src/components/kiosk/ContactInput.tsx',
    'frontend/src/components/kiosk/OrderCompletionFlow.tsx',
    'frontend/src/components/kiosk/OrderQRCode.tsx',
    'frontend/src/components/ui/Card.tsx',
    'frontend/src/components/ui/Modal.tsx',
    'frontend/src/hooks/useAdminApi.ts',
    'frontend/src/hooks/usePublicApi.ts',
    'frontend/src/services/adminApi.ts',
    'frontend/src/services/notificationService.ts',
    'frontend/src/store/slices/authSlice.ts',
    'frontend/src/store/slices/orderSlice.ts',
    'src/controllers/order.controller.js',
    'src/views/admin/kiosk-monitor.ejs',
    'src/views/admin/settings.ejs',
    'uploads/menus/README.md'
  ];

  const existingPrunedPaths = prunedPaths.filter((filePath) => fs.existsSync(path.join(rootDir, filePath)));
  if (existingPrunedPaths.length > 0) {
    throw new Error(`Pruned support/runtime artifacts must not exist: ${existingPrunedPaths.join(', ')}`);
  }

  console.log('ok pruned artifacts absent');
};

const verifyBackendRequireGraph = () => {
  const srcDir = path.join(rootDir, 'src');
  const sourceFiles = walk(srcDir, (filePath) => filePath.endsWith('.js')).sort();
  const resolveLocalRequire = (fromFile, specifier) => {
    if (!specifier.startsWith('.')) return null;

    const basePath = path.resolve(path.dirname(fromFile), specifier);
    const candidates = [
      basePath,
      `${basePath}.js`,
      path.join(basePath, 'index.js')
    ];
    return candidates.find((candidate) => (
      candidate.startsWith(srcDir) &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()
    )) || null;
  };
  const dependencyMap = new Map(sourceFiles.map((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    const dependencies = Array.from(
      source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g),
      (match) => resolveLocalRequire(filePath, match[1])
    ).filter(Boolean);
    return [filePath, dependencies];
  }));
  const reachable = new Set();
  const pending = [path.join(srcDir, 'server.js')];

  while (pending.length > 0) {
    const filePath = pending.pop();
    if (!filePath || reachable.has(filePath)) continue;
    reachable.add(filePath);
    (dependencyMap.get(filePath) || []).forEach((dependency) => pending.push(dependency));
  }

  const unreachable = sourceFiles.filter((filePath) => !reachable.has(filePath));
  if (unreachable.length > 0) {
    throw new Error(`src contains JavaScript files that are not reachable from src/server.js: ${unreachable.map(relative).join(', ')}`);
  }
  const routeFiles = sourceFiles.filter(filePath => relative(filePath).startsWith('src/routes/'));
  const staleRouteFiles = routeFiles.filter((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    return /\bvar\s+router\s*=\s*require\(['"]express['"]\)\.Router\(\)/.test(source) ||
      /can be public|protect for consistency|similar to findAll|Import the middleware|Apply middleware to all/.test(source);
  });
  if (staleRouteFiles.length > 0) {
    throw new Error(`Route registration files must not keep legacy router declarations or stale intent comments: ${staleRouteFiles.map(relative).join(', ')}`);
  }

  console.log('ok backend require graph');
};

const verifyFrontendSourceGraph = () => {
  const srcDir = path.join(rootDir, 'frontend/src');
  const sourceFiles = walk(srcDir, (filePath) => (
    /\.(?:ts|tsx|css)$/.test(filePath) && !filePath.endsWith('.d.ts')
  )).sort();
  const resolveLocalImport = (fromFile, specifier) => {
    if (!specifier.startsWith('.')) return null;

    const basePath = path.resolve(path.dirname(fromFile), specifier);
    const candidates = [
      basePath,
      `${basePath}.ts`,
      `${basePath}.tsx`,
      `${basePath}.css`,
      path.join(basePath, 'index.ts'),
      path.join(basePath, 'index.tsx')
    ];
    return candidates.find((candidate) => (
      candidate.startsWith(srcDir) &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()
    )) || null;
  };
  const dependencyMap = new Map(sourceFiles.map((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    const importPatterns = [
      /import\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
      /export\s+(?:type\s+)?[^'"]+?\s+from\s+['"]([^'"]+)['"]/g,
      /import\(\s*['"]([^'"]+)['"]\s*\)/g
    ];
    const dependencies = importPatterns.flatMap((pattern) => (
      Array.from(source.matchAll(pattern), (match) => resolveLocalImport(filePath, match[1]))
    )).filter(Boolean);
    return [filePath, dependencies];
  }));
  const reachable = new Set();
  const pending = [path.join(srcDir, 'main.tsx')];

  while (pending.length > 0) {
    const filePath = pending.pop();
    if (!filePath || reachable.has(filePath)) continue;
    reachable.add(filePath);
    (dependencyMap.get(filePath) || []).forEach((dependency) => pending.push(dependency));
  }

  const unreachable = sourceFiles.filter((filePath) => !reachable.has(filePath));
  if (unreachable.length > 0) {
    throw new Error(`frontend/src contains files that are not reachable from frontend/src/main.tsx: ${unreachable.map(relative).join(', ')}`);
  }

  console.log('ok frontend source graph');
};

const verifyShellSyntaxScriptCoverage = () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const shellScriptFiles = walk(path.join(rootDir, 'scripts'), (filePath) => filePath.endsWith('.sh'))
    .map(relative)
    .sort();
  const shellCheckScript = packageJson.scripts?.['db:backup:check'] || '';

  if (!shellCheckScript.startsWith('bash -n ')) {
    throw new Error('package.json db:backup:check must run bash -n for shell syntax validation.');
  }

  const missingShellScripts = shellScriptFiles.filter((scriptPath) => !shellCheckScript.includes(scriptPath));
  if (missingShellScripts.length > 0) {
    throw new Error(`package.json db:backup:check must include every scripts/*.sh file: ${missingShellScripts.join(', ')}`);
  }

  console.log('ok shell syntax script coverage');
};

const verifyPackageScriptFileReferences = () => {
  [
    path.join(rootDir, 'package.json'),
    path.join(rootDir, 'frontend/package.json')
  ].forEach((packageFile) => {
    const packageDir = path.dirname(packageFile);
    const packageName = relative(packageFile);
    const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'));

    Object.entries(packageJson.scripts || {}).forEach(([scriptName, command]) => {
      const referencedScriptFiles = Array.from(
        command.matchAll(/\bscripts\/[A-Za-z0-9._/-]+\.(?:js|sh)\b/g),
        (match) => match[0]
      );
      referencedScriptFiles.forEach((scriptPath) => {
        if (!fs.existsSync(path.join(packageDir, scriptPath))) {
          throw new Error(`${packageName} script ${scriptName} references missing file ${scriptPath}.`);
        }
      });
    });
  });

  console.log('ok package script file references');
};

const verifyLiveDocPackageScriptReferences = () => {
  const rootPackageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const frontendPackageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'frontend/package.json'), 'utf8'));
  const packageScripts = {
    root: rootPackageJson.scripts || {},
    frontend: frontendPackageJson.scripts || {}
  };
  const liveDocPaths = [
    'README.md',
    'frontend/README.md',
    'API_TEST_GUIDE.md',
    'REQUIREMENTS.md',
    'ADMIN_ACCESS_GUIDE.md',
    'ADMIN_ISSUE_RESOLUTION.md',
    'OPERATIONS_RUNBOOK.md',
    'PORT_CHANGE_GUIDE.md'
  ];
  const missingReferences = [];

  liveDocPaths.forEach((docPath) => {
    const defaultPackageName = docPath.startsWith('frontend/') ? 'frontend' : 'root';
    let packageName = defaultPackageName;
    let inFence = false;

    fs.readFileSync(path.join(rootDir, docPath), 'utf8').split(/\r?\n/).forEach((line, index) => {
      const lineNumber = index + 1;
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        packageName = defaultPackageName;
        return;
      }

      const linePackageName = /\bcd\s+frontend\b/.test(line) ? 'frontend' : packageName;
      const scriptNames = [
        ...Array.from(line.matchAll(/\bnpm\s+run(?:-script)?\s+([A-Za-z0-9:._-]+)/g), (match) => match[1]),
        ...Array.from(line.matchAll(/\bnpm\s+(test|start)\b/g), (match) => match[1])
      ];

      scriptNames.forEach((scriptName) => {
        const targetPackageName = linePackageName === 'frontend' ? 'frontend' : 'root';
        if (!packageScripts[targetPackageName][scriptName]) {
          missingReferences.push(`${docPath}:${lineNumber} ${targetPackageName}:${scriptName}`);
        }
      });

      if (inFence && /^\s*cd\s+frontend\s*$/.test(line)) {
        packageName = 'frontend';
      }
    });
  });

  if (missingReferences.length > 0) {
    throw new Error(`live docs reference missing package scripts: ${missingReferences.join(', ')}`);
  }

  console.log('ok live doc package script references');
};

const verifyLiveScriptPathReferences = () => {
  const frontendDir = path.join(rootDir, 'frontend');
  const scriptPathPattern = /\b((?:frontend\/)?scripts\/[A-Za-z0-9._/-]+\.(?:js|sh))\b/g;
  const liveDocPaths = [
    'README.md',
    'frontend/README.md',
    'API_TEST_GUIDE.md',
    'REQUIREMENTS.md',
    'ADMIN_ACCESS_GUIDE.md',
    'ADMIN_ISSUE_RESOLUTION.md',
    'OPERATIONS_RUNBOOK.md',
    'PORT_CHANGE_GUIDE.md'
  ];
  const missingReferences = [];
  const unsupportedWorkflowDirectories = [];

  const checkLine = (sourcePath, lineNumber, line, baseDir) => {
    Array.from(line.matchAll(scriptPathPattern), (match) => match[1]).forEach((scriptPath) => {
      const referenceBaseDir = scriptPath.startsWith('frontend/') ? rootDir : baseDir;
      if (!fs.existsSync(path.join(referenceBaseDir, scriptPath))) {
        missingReferences.push(`${sourcePath}:${lineNumber} ${scriptPath}`);
      }
    });
  };

  liveDocPaths.forEach((docPath) => {
    const defaultBaseDir = docPath.startsWith('frontend/') ? frontendDir : rootDir;
    let baseDir = defaultBaseDir;
    let inFence = false;

    fs.readFileSync(path.join(rootDir, docPath), 'utf8').split(/\r?\n/).forEach((line, index) => {
      const lineNumber = index + 1;
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        baseDir = defaultBaseDir;
        return;
      }

      checkLine(docPath, lineNumber, line, /\bcd\s+frontend\b/.test(line) ? frontendDir : baseDir);

      if (inFence && /^\s*cd\s+frontend\s*$/.test(line)) {
        baseDir = frontendDir;
      }
    });
  });

  walk(path.join(rootDir, '.github/workflows'), (filePath) => /\.(?:ya?ml)$/.test(filePath)).forEach((workflowPath) => {
    const source = fs.readFileSync(workflowPath, 'utf8');
    const lines = source.split(/\r?\n/);
    let inJobs = false;
    let inSteps = false;
    let jobDefaultWorkingDirectory = '.';
    let stepWorkingDirectory = null;
    let activeRunContext = null;

    const checkWorkflowLine = (line, lineNumber, workingDirectory) => {
      const normalizedWorkingDirectory = normalizeWorkflowWorkingDirectory(workingDirectory);
      if (!['.', 'frontend'].includes(normalizedWorkingDirectory)) {
        unsupportedWorkflowDirectories.push(`${relative(workflowPath)}:${lineNumber} (${normalizedWorkingDirectory})`);
        return;
      }
      checkLine(
        relative(workflowPath),
        lineNumber,
        line,
        normalizedWorkingDirectory === 'frontend' ? frontendDir : rootDir
      );
    };

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const trimmed = line.trim();
      const indent = line.match(/^\s*/)[0].length;

      if (activeRunContext && trimmed && indent <= activeRunContext.indent) {
        activeRunContext = null;
      }
      if (/^jobs:\s*$/.test(line)) {
        inJobs = true;
      }
      if (inJobs && /^  [A-Za-z0-9_-]+:\s*$/.test(line)) {
        inSteps = false;
        jobDefaultWorkingDirectory = '.';
        stepWorkingDirectory = null;
      }
      if (inJobs && /^    steps:\s*$/.test(line)) {
        inSteps = true;
        stepWorkingDirectory = null;
      }
      if (inSteps && /^      -\s+/.test(line)) {
        stepWorkingDirectory = null;
      }

      const workingDirectoryMatch = line.match(/^\s+working-directory:\s*([A-Za-z0-9_./'":-]+)\s*$/);
      if (workingDirectoryMatch) {
        if (inSteps) {
          stepWorkingDirectory = workingDirectoryMatch[1];
        } else {
          jobDefaultWorkingDirectory = workingDirectoryMatch[1];
        }
      }

      const currentWorkingDirectory = stepWorkingDirectory || jobDefaultWorkingDirectory;
      const runMatch = line.match(/^(\s*)run:\s*(.*)$/);
      if (runMatch) {
        const runIndent = runMatch[1].length;
        const runCommand = runMatch[2].trim();
        if (runCommand === '|' || runCommand === '>-') {
          activeRunContext = {
            indent: runIndent,
            workingDirectory: currentWorkingDirectory
          };
        } else {
          checkWorkflowLine(runCommand, lineNumber, currentWorkingDirectory);
        }
        return;
      }

      if (activeRunContext) {
        checkWorkflowLine(line, lineNumber, activeRunContext.workingDirectory);
      }
    });
  });

  if (unsupportedWorkflowDirectories.length > 0) {
    throw new Error(`workflow direct script path references must run from root or frontend only: ${unsupportedWorkflowDirectories.join(', ')}`);
  }
  if (missingReferences.length > 0) {
    throw new Error(`live docs or workflows reference missing script files: ${missingReferences.join(', ')}`);
  }

  console.log('ok live script path references');
};

const verifyDockerBuildContextContract = () => {
  const dockerignoreSource = fs.readFileSync(path.join(rootDir, '.dockerignore'), 'utf8');
  const frontendDockerignoreSource = fs.readFileSync(path.join(rootDir, 'frontend/.dockerignore'), 'utf8');
  const dockerfileSource = fs.readFileSync(path.join(rootDir, 'Dockerfile'), 'utf8');
  const frontendDockerfileSource = fs.readFileSync(path.join(rootDir, 'frontend/Dockerfile'), 'utf8');
  const composeSources = [
    ['docker-compose.yml', fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8')],
    ['docker-compose.prod.yml', fs.readFileSync(path.join(rootDir, 'docker-compose.prod.yml'), 'utf8')]
  ];

  const dockerBuildSourcePaths = [
    'package.json',
    'package-lock.json',
    'src',
    'public',
    'scripts/create-admin.js',
    'scripts/db-apply-schema.sh',
    'scripts/db-backup.sh',
    'scripts/db-migrate.js',
    'scripts/db-restore-drill.sh',
    'scripts/db-restore.sh',
    'database',
    'database_schema.sql',
    'frontend/package.json',
    'frontend/package-lock.json',
    'frontend/nginx.conf'
  ];
  dockerBuildSourcePaths.forEach((sourcePath) => {
    if (!fs.existsSync(path.join(rootDir, sourcePath))) {
      throw new Error(`Docker build source path is missing: ${sourcePath}`);
    }
  });

  const missingComposeMounts = [];
  composeSources.forEach(([composePath, source]) => {
    source.split(/\r?\n/).forEach((line, index) => {
      const mountMatch = line.match(/^\s*-\s+\.\/([^:]+):/);
      if (mountMatch && !fs.existsSync(path.join(rootDir, mountMatch[1]))) {
        missingComposeMounts.push(`${composePath}:${index + 1} ./${mountMatch[1]}`);
      }
    });
  });
  if (missingComposeMounts.length > 0) {
    throw new Error(`Compose bind mount sources must exist: ${missingComposeMounts.join(', ')}`);
  }

  [
    ['root node_modules', /^node_modules$/m, dockerignoreSource],
    ['frontend node_modules', /^frontend\/node_modules$/m, dockerignoreSource],
    ['frontend build output', /^frontend\/dist$/m, dockerignoreSource],
    ['root build output', /^dist$/m, dockerignoreSource],
    ['SSR build output', /^dist-ssr$/m, dockerignoreSource],
    ['coverage output', /^coverage$/m, dockerignoreSource],
    ['runtime logs', /^logs$/m, dockerignoreSource],
    ['database backups', /^backups$/m, dockerignoreSource],
    ['runtime uploads', /^uploads$/m, dockerignoreSource],
    ['default local env file', /^\.env$/m, dockerignoreSource],
    ['local env files', /^\.env\.\*$/m, dockerignoreSource],
    ['log files', /^\*\.log$/m, dockerignoreSource],
    ['backup archives', /^\*\.sql\.gz$/m, dockerignoreSource],
    ['package archives', /^\*\.tgz$/m, dockerignoreSource],
    ['local cache directory', /^\.cache$/m, dockerignoreSource],
    ['vite cache directory', /^\.vite$/m, dockerignoreSource],
    ['history snapshots', /^\.history$/m, dockerignoreSource],
    ['cookie scratch file', /^cookies\.txt$/m, dockerignoreSource],
    ['frontend dist output', /^dist$/m, frontendDockerignoreSource],
    ['frontend dist-ssr output', /^dist-ssr$/m, frontendDockerignoreSource],
    ['frontend coverage output', /^coverage$/m, frontendDockerignoreSource],
    ['frontend default local env file', /^\.env$/m, frontendDockerignoreSource],
    ['frontend local env files', /^\.env\.\*$/m, frontendDockerignoreSource],
    ['frontend cache directory', /^\.cache$/m, frontendDockerignoreSource],
    ['frontend vite cache directory', /^\.vite$/m, frontendDockerignoreSource],
    ['frontend log files', /^\*\.log$/m, frontendDockerignoreSource],
    ['frontend package archives', /^\*\.tgz$/m, frontendDockerignoreSource]
  ].forEach(([label, pattern, source]) => {
    if (!pattern.test(source)) {
      throw new Error(`Docker build context must ignore ${label}.`);
    }
  });
  if (/^!\.env(?:\.[A-Za-z0-9_-]+)?$/m.test(dockerignoreSource) || /^!\.env(?:\.[A-Za-z0-9_-]+)?$/m.test(frontendDockerignoreSource)) {
    throw new Error('Docker build contexts must not re-include env example files; compose env files stay host-side and frontend builds use explicit build args or real env files.');
  }

  if (/COPY\s+scripts\s+\.\/scripts/.test(dockerfileSource)) {
    throw new Error('Backend Dockerfile must not copy the full scripts directory into the production image.');
  }
  if (!/COPY nginx\.conf \/etc\/nginx\/conf\.d\/default\.conf/.test(frontendDockerfileSource)) {
    throw new Error('Frontend Dockerfile must copy the checked-in nginx.conf runtime config.');
  }
  const runtimeScriptPaths = [
    'scripts/create-admin.js',
    'scripts/db-apply-schema.sh',
    'scripts/db-backup.sh',
    'scripts/db-migrate.js',
    'scripts/db-restore-drill.sh',
    'scripts/db-restore.sh'
  ];
  runtimeScriptPaths.forEach((scriptPath) => {
    if (!dockerfileSource.includes(scriptPath)) {
      throw new Error(`Backend Dockerfile must include operational script ${scriptPath}.`);
    }
  });
  const copiedScriptPaths = Array.from(new Set(
    Array.from(dockerfileSource.matchAll(/scripts\/[A-Za-z0-9._-]+\.(?:js|sh)/g), (match) => match[0])
  )).sort();
  const unexpectedCopiedScriptPaths = copiedScriptPaths.filter((scriptPath) => !runtimeScriptPaths.includes(scriptPath));
  if (
    copiedScriptPaths.length !== runtimeScriptPaths.length ||
    unexpectedCopiedScriptPaths.length > 0
  ) {
    throw new Error(`Backend Dockerfile must copy only runtime operational scripts: ${unexpectedCopiedScriptPaths.join(', ') || copiedScriptPaths.join(', ')}`);
  }
  [
    'scripts/e2e-browser.js',
    'scripts/e2e-db-api.js',
    'scripts/verify-static.js',
    'scripts/deploy-compose.sh',
    'scripts/deploy-remote-compose.sh',
    'scripts/github-actions-secrets-audit.sh',
    'scripts/github-environment-audit.sh',
    'scripts/production-preflight.sh',
    'scripts/ops-smoke.js',
    'scripts/heartbeat-soak.js'
  ].forEach((scriptPath) => {
    if (dockerfileSource.includes(scriptPath)) {
      throw new Error(`Backend production image must not copy non-runtime script ${scriptPath}.`);
    }
  });
  const runtimeNpmScriptBlock = (dockerfileSource.match(/const runtimeScripts = \[([\s\S]*?)\];/) || [])[1] || '';
  const runtimeNpmScripts = [
    'start',
    'admin:create',
    'db:backup',
    'db:restore',
    'db:restore:drill',
    'db:apply-schema',
    'db:migrate',
    'db:migrate:status',
    'db:rollback'
  ];
  if (!/pkg\.scripts = Object\.fromEntries/.test(dockerfileSource) || !/Missing runtime npm scripts/.test(dockerfileSource)) {
    throw new Error('Backend Dockerfile must prune package.json scripts inside the production image.');
  }
  runtimeNpmScripts.forEach((scriptName) => {
    if (!runtimeNpmScriptBlock.includes(`'${scriptName}'`)) {
      throw new Error(`Backend production image must keep runtime npm script ${scriptName}.`);
    }
  });
  const runtimeNpmScriptNames = Array.from(runtimeNpmScriptBlock.matchAll(/['"]([^'"]+)['"]/g), (match) => match[1]);
  const unexpectedRuntimeNpmScripts = runtimeNpmScriptNames.filter((scriptName) => !runtimeNpmScripts.includes(scriptName));
  if (
    runtimeNpmScriptNames.length !== runtimeNpmScripts.length ||
    unexpectedRuntimeNpmScripts.length > 0
  ) {
    throw new Error(`Backend production image must expose only runtime npm scripts: ${unexpectedRuntimeNpmScripts.join(', ') || runtimeNpmScriptNames.join(', ')}`);
  }
  [
    'dev',
    'test',
    'test:e2e',
    'test:e2e:browser',
    'docs',
    'setup',
    'db:backup:check',
    'ops:preflight',
    'ops:smoke',
    'ops:heartbeat-soak',
    'ops:github-env:check',
    'ops:github-actions:check',
    'deploy:compose',
    'deploy:remote'
  ].forEach((scriptName) => {
    if (runtimeNpmScriptBlock.includes(`'${scriptName}'`) || runtimeNpmScriptBlock.includes(`"${scriptName}"`)) {
      throw new Error(`Backend production image must not advertise non-runtime npm script ${scriptName}.`);
    }
  });

  console.log('ok docker build context');
};

const verifyBackendRuntimeLogging = () => {
  const sourceFiles = walk(path.join(rootDir, 'src'), (filePath) => filePath.endsWith('.js'));
  const offenders = sourceFiles.filter((filePath) => (
    /console\.(?:log|debug|warn|error)\s*\(/.test(fs.readFileSync(filePath, 'utf8'))
  ));
  const browserRuntimeFiles = [
    ...walk(path.join(rootDir, 'frontend/src'), (filePath) => filePath.endsWith('.ts') || filePath.endsWith('.tsx')),
    ...walk(path.join(rootDir, 'public/js'), (filePath) => filePath.endsWith('.js'))
  ];
  const browserOffenders = browserRuntimeFiles.filter((filePath) => (
    /console\.(?:log|debug|warn|error)\s*\(/.test(fs.readFileSync(filePath, 'utf8'))
  ));

  if (offenders.length > 0) {
    throw new Error(`Backend runtime code must use the structured logger instead of console.*: ${offenders.map(relative).join(', ')}`);
  }
  if (browserOffenders.length > 0) {
    throw new Error(`Browser runtime code must not keep console.* side effects: ${browserOffenders.map(relative).join(', ')}`);
  }

  const categoryControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/category.controller.js'), 'utf8');
  const categoryModelSource = fs.readFileSync(path.join(rootDir, 'src/models/category.model.js'), 'utf8');
  const menuControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/menu.controller.js'), 'utf8');
  const menuModelSource = fs.readFileSync(path.join(rootDir, 'src/models/menu.model.js'), 'utf8');
  const webAdminControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/webAdmin.controller.js'), 'utf8');
  const adminControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/admin.controller.js'), 'utf8');
  const adminModelSource = fs.readFileSync(path.join(rootDir, 'src/models/admin.model.js'), 'utf8');
  const loggerSource = fs.readFileSync(path.join(rootDir, 'src/utils/logger.js'), 'utf8');
  const loggingMiddlewareSource = fs.readFileSync(path.join(rootDir, 'src/middleware/logging.middleware.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(rootDir, 'src/server.js'), 'utf8');
  const auditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');

  if (
    !/const logDir = path\.resolve\(process\.cwd\(\), process\.env\.LOG_DIR \|\| 'logs'\);/.test(loggerSource) ||
    !/fs\.mkdirSync\(logDir, \{ recursive: true \}\);/.test(loggerSource)
  ) {
    throw new Error('logger.js must resolve LOG_DIR and create nested log directories recursively before configuring file transports.');
  }
  const jsonParserIndex = serverSource.indexOf('app.use(express.json({ limit: requestBodyLimit }))');
  const urlencodedParserIndex = serverSource.indexOf('app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }))');
  const securityLoggerIndex = serverSource.indexOf('app.use(securityLogger)');
  if (
    !/JSON\.stringify\(req\.body\)/.test(loggingMiddlewareSource) ||
    jsonParserIndex === -1 ||
    urlencodedParserIndex === -1 ||
    securityLoggerIndex === -1 ||
    securityLoggerIndex < jsonParserIndex ||
    securityLoggerIndex < urlencodedParserIndex
  ) {
    throw new Error('securityLogger must run after JSON and URL-encoded parsers so suspicious request bodies are observable.');
  }
  if (!/`securityLogger`는 의심 URL뿐 아니라 `req\.body`도 검사/.test(auditSource) || !/body parser 뒤로 이동/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the securityLogger body-parser ordering fix.');
  }

  if (/err\.kind/.test(categoryControllerSource) || /kind:\s*["']not_found/.test(categoryModelSource)) {
    throw new Error('Admin category controller must not keep unreachable err.kind not_found branches.');
  }
  if (/message:\s*(?:err|error)\.message/.test(`${adminControllerSource}\n${categoryControllerSource}\n${menuControllerSource}`)) {
    throw new Error('Admin API controllers must log internal errors instead of returning raw error.message values.');
  }
  if (/catch\s*\(\s*(err|error)\s*\)\s*\{\s*throw\s+\1\s*;?\s*\}/.test(`${adminModelSource}\n${categoryModelSource}\n${menuModelSource}`)) {
    throw new Error('Admin/Category/Menu models must not keep no-op catch blocks that only rethrow the same error.');
  }
  if (/const (?:Category|Menu) = function|new\s+(?:Category|Menu)\s*\(/.test(`${categoryModelSource}\n${menuModelSource}\n${categoryControllerSource}\n${menuControllerSource}\n${webAdminControllerSource}`)) {
    throw new Error('Category/Menu models must not keep legacy constructor wrappers; create() owns default normalization.');
  }
  if (
    !/const Category = \{\};/.test(categoryModelSource) ||
    !/const sortOrder = parseNonNegativeInteger\(newCategory\.sort_order\);[\s\S]*if \(sortOrder === null\) \{[\s\S]*sort_order must be a non-negative integer[\s\S]*const category = \{[\s\S]*name: normalizeRequiredText\(newCategory\.name, 'name'\),[\s\S]*sort_order: sortOrder[\s\S]*\};/.test(categoryModelSource) ||
    !/const Menu = \{\};/.test(menuModelSource) ||
    !/const categoryId = parsePositiveInteger\(newMenu\.category_id\);[\s\S]*const price = parseNonNegativePrice\(newMenu\.price\);[\s\S]*const menu = \{[\s\S]*category_id: categoryId,[\s\S]*name: normalizeRequiredText\(newMenu\.name, 'name'\),[\s\S]*price,[\s\S]*image_url: normalizeOptionalText\(newMenu\.image_url, 'image_url'\),[\s\S]*description: normalizeOptionalText\(newMenu\.description, 'description'\),[\s\S]*status: normalizeStatus\(newMenu\.status, true\)[\s\S]*\};/.test(menuModelSource)
  ) {
    throw new Error('Category/Menu create() methods must keep their default normalization after constructor pruning.');
  }
  const categoryControllerUsesStrictIds = [
    /const parsePositiveInteger = \(value\) => \{[\s\S]*typeof value === 'number'[\s\S]*typeof value === 'string' \? value\.trim\(\) : ''[\s\S]*\/\^\[1-9\]\[0-9\]\*\$\/\.test\(text\) \? Number\(text\) : null;[\s\S]*return Number\.isSafeInteger\(parsed\) \? parsed : null;[\s\S]*\};/.test(categoryControllerSource),
    /const id = parsePositiveInteger\(req\.params\.id\);[\s\S]*if \(id === null\) \{[\s\S]*Invalid Category ID format/.test(categoryControllerSource),
    /Category\.findById\(id\)/.test(categoryControllerSource),
    /Category\.updateById\(id, categoryDataToUpdate\)/.test(categoryControllerSource),
    /Category\.remove\(id\)/.test(categoryControllerSource)
  ].every(Boolean);
  const categoryModelUsesStrictIds = [
    /const parsePositiveInteger = \(value\) => \{[\s\S]*typeof value === 'number'[\s\S]*typeof value === 'string' \? value\.trim\(\) : ''[\s\S]*\/\^\[1-9\]\[0-9\]\*\$\/\.test\(text\) \? Number\(text\) : null;[\s\S]*return Number\.isSafeInteger\(parsed\) \? parsed : null;[\s\S]*\};/.test(categoryModelSource),
    /Category\.findById = async \(id\) => \{[\s\S]*const normalizedId = parsePositiveInteger\(id\);[\s\S]*if \(normalizedId === null\) \{[\s\S]*return null;[\s\S]*\[normalizedId\]/.test(categoryModelSource),
    /Category\.updateById = async \(id, categoryData\) => \{[\s\S]*const normalizedId = parsePositiveInteger\(id\);[\s\S]*if \(normalizedId === null\) \{[\s\S]*return null;[\s\S]*values\.push\(normalizedId\);[\s\S]*return \{ id: normalizedId, \.\.\.categoryData \};/.test(categoryModelSource),
    /Category\.remove = async \(id\) => \{[\s\S]*const normalizedId = parsePositiveInteger\(id\);[\s\S]*if \(normalizedId === null\) \{[\s\S]*return null;[\s\S]*\[normalizedId\][\s\S]*return \{ id: normalizedId, message: "Category deleted successfully" \};/.test(categoryModelSource)
  ].every(Boolean);
  if (/String\(value \|\| ''\)|const id = req\.params\.id/.test(`${categoryControllerSource}\n${categoryModelSource}`) || !categoryControllerUsesStrictIds || !categoryModelUsesStrictIds) {
    throw new Error('Category controller/model must strictly normalize positive integer IDs before DB access.');
  }
  const categorySortOrderIsStrict = [
    !/Number\.parseInt\(|parseInt\(/.test(`${categoryControllerSource}\n${categoryModelSource}`),
    /const parseNonNegativeInteger = \(value\) => \{[\s\S]*if \(value === undefined \|\| value === ''\) return 0;[\s\S]*typeof value === 'number'[\s\S]*typeof value === 'string' \? value\.trim\(\) : ''[\s\S]*\/\^\(0\|\[1-9\]\[0-9\]\*\)\$\/\.test\(text\) \? Number\(text\) : null;[\s\S]*return Number\.isSafeInteger\(parsed\) \? parsed : null;[\s\S]*\};/.test(categoryControllerSource),
    /const parseNonNegativeInteger = \(value\) => \{[\s\S]*if \(value === undefined \|\| value === ''\) return 0;[\s\S]*typeof value === 'number'[\s\S]*typeof value === 'string' \? value\.trim\(\) : ''[\s\S]*\/\^\(0\|\[1-9\]\[0-9\]\*\)\$\/\.test\(text\) \? Number\(text\) : null;[\s\S]*return Number\.isSafeInteger\(parsed\) \? parsed : null;[\s\S]*\};/.test(categoryModelSource),
    /const sortOrder = parseNonNegativeInteger\(req\.body\.sort_order\);[\s\S]*sort_order must be a non-negative integer/.test(categoryControllerSource),
    /categoryDataToUpdate\.sort_order = sortOrder;/.test(categoryControllerSource),
    /if \(categoryData\.sort_order !== undefined\) \{[\s\S]*const sortOrder = parseNonNegativeInteger\(categoryData\.sort_order\);[\s\S]*sort_order must be a non-negative integer[\s\S]*values\.push\(sortOrder\);[\s\S]*categoryData\.sort_order = sortOrder;/.test(categoryModelSource)
  ].every(Boolean);
  if (!categorySortOrderIsStrict) {
    throw new Error('Category controller/model must strictly normalize non-negative integer sort_order before DB writes.');
  }
  const categoryNameIsStrict = [
    /const normalizeRequiredText = \(value\) => \{[\s\S]*if \(typeof value !== 'string'\) return null;[\s\S]*const text = value\.trim\(\);[\s\S]*return text \|\| null;[\s\S]*\};/.test(categoryControllerSource),
    /const name = normalizeRequiredText\(req\.body\.name\);[\s\S]*Category name can not be empty/.test(categoryControllerSource),
    /const name = req\.query\.name === undefined \|\| req\.query\.name === ''[\s\S]*normalizeRequiredText\(req\.query\.name\);[\s\S]*Invalid category name filter/.test(categoryControllerSource),
    /const name = normalizeRequiredText\(req\.body\.name\);[\s\S]*Category name cannot be empty if provided for update/.test(categoryControllerSource),
    /const normalizeRequiredText = \(value, fieldName\) => \{[\s\S]*typeof value !== 'string'[\s\S]*\$\{fieldName\} must be a non-empty string\.[\s\S]*return text;[\s\S]*\};/.test(categoryModelSource),
    /let normalizedName = null;[\s\S]*if \(name !== undefined && name !== null && name !== ''\) \{[\s\S]*if \(typeof name !== 'string'\) \{[\s\S]*name filter must be a string\.[\s\S]*const text = name\.trim\(\);[\s\S]*normalizedName = text \|\| null;[\s\S]*if \(normalizedName\) \{[\s\S]*params\.push\(`%\$\{normalizedName\}%`\);/.test(categoryModelSource),
    /if \(categoryData\.name !== undefined\) \{[\s\S]*const name = normalizeRequiredText\(categoryData\.name, 'name'\);[\s\S]*values\.push\(name\);[\s\S]*categoryData\.name = name;/.test(categoryModelSource)
  ].every(Boolean);
  if (/const normalizeOptionalSearchText\s*=|normalizeOptionalSearchText\(|name:\s*newCategory\.name|categoryDataToUpdate\.name = req\.body\.name|values\.push\(categoryData\.name\)|params\.push\(`%\$\{name\}%`\)/.test(`${categoryControllerSource}\n${categoryModelSource}`) || !categoryNameIsStrict) {
    throw new Error('Category controller/model must validate category names and name filters as strings before DB writes/queries.');
  }

  [
    'Admin category create',
    'Admin category list',
    'Admin category detail',
    'Admin category update',
    'Admin category delete'
  ].forEach((context) => {
    if (!categoryControllerSource.includes(`context: '${context}'`)) {
      throw new Error(`category.controller.js must log ${context} errors.`);
    }
  });

  [
    'Admin menu create',
    'Admin menu list',
    'Admin menu detail',
    'Admin menu update',
    'Admin menu delete',
    'Menu image upload'
  ].forEach((context) => {
    if (!menuControllerSource.includes(`context: '${context}'`)) {
      throw new Error(`menu.controller.js must log ${context} errors.`);
    }
  });

  console.log('ok runtime logging');
};

const verifyStaticAssets = () => {
  const requiredAssets = [
    'public/favicon.svg',
    'frontend/public/favicon.svg',
    'frontend/public/images/no-image.svg'
  ];
  const adminCssSource = fs.readFileSync(path.join(rootDir, 'public/css/admin.css'), 'utf8');

  requiredAssets.forEach((assetPath) => {
    if (!fs.existsSync(path.join(rootDir, assetPath))) {
      throw new Error(`Required static asset is missing: ${assetPath}`);
    }
  });

  const checkedFiles = [
    'frontend/src/components/kiosk/MenuGrid.tsx',
    'frontend/src/pages/KioskPage.tsx',
    'frontend/index.html',
    'public/js/admin.js',
    'src/config/swagger.config.js'
  ];
  const forbiddenReferences = [
    /\/placeholder-menu\.jpg/,
    /\/images\/no-image\.png/,
    /\/favicon\.ico/
  ];

  checkedFiles.forEach((filePath) => {
    const source = fs.readFileSync(path.join(rootDir, filePath), 'utf8');
    const forbiddenReference = forbiddenReferences.find(pattern => pattern.test(source));
    if (forbiddenReference) {
      throw new Error(`Stale static asset reference in ${filePath}: ${forbiddenReference}`);
    }
  });
  if (/\.(?:fade-in|highlight-new|loading-spinner|status-icon|status-online|status-offline|status-warning|live-indicator)\b|@keyframes (?:fadeIn|highlightFade|spin|pulse)\b/.test(adminCssSource)) {
    throw new Error('public/css/admin.css must not keep unused admin animation/status utility selectors.');
  }
  if (/--(?:secondary|danger|light|dark|bg|text|card)-color|prefers-color-scheme:\s*dark/.test(adminCssSource)) {
    throw new Error('public/css/admin.css must not keep unused theme variables or no-op dark-mode scaffolding.');
  }
  if (/\.footer\b/.test(adminCssSource)) {
    throw new Error('public/css/admin.css must not keep stale .footer selectors; admin renders a footer element, not a footer class.');
  }

  console.log('ok static assets');
};

const verifyAdminVendorAssets = () => {
  const serverSource = fs.readFileSync(path.join(rootDir, 'src/server.js'), 'utf8');
  const layoutSource = fs.readFileSync(path.join(rootDir, 'src/views/layouts/admin.ejs'), 'utf8');
  const loginSource = fs.readFileSync(path.join(rootDir, 'src/views/admin/login.ejs'), 'utf8');
  const dashboardSource = fs.readFileSync(path.join(rootDir, 'src/views/admin/dashboard.ejs'), 'utf8');
  const ordersSource = fs.readFileSync(path.join(rootDir, 'src/views/admin/orders.ejs'), 'utf8');
  const statisticsSource = fs.readFileSync(path.join(rootDir, 'src/views/admin/statistics.ejs'), 'utf8');
  const e2eBrowserSource = fs.readFileSync(path.join(rootDir, 'scripts/e2e-browser.js'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const adminRuntimeViewFiles = [
    ...walk(path.join(rootDir, 'src/views/admin'), (filePath) => filePath.endsWith('.ejs')),
    ...walk(path.join(rootDir, 'src/views/partials'), (filePath) => filePath.endsWith('.ejs')),
    path.join(rootDir, 'src/views/layouts/admin.ejs')
  ].sort();
  const adminViewSource = adminRuntimeViewFiles
    .map((filePath) => fs.readFileSync(filePath, 'utf8'))
    .join('\n');

  [
    ['bootstrap', '5.3.0'],
    ['bootstrap-icons', '1.10.0'],
    ['chart.js', '4.4.0']
  ].forEach(([dependency, version]) => {
    if (packageJson.dependencies[dependency] !== version) {
      throw new Error(`Admin browser asset dependency ${dependency} must be pinned to ${version}.`);
    }
  });
  if (packageJson.scripts['deps:check'] !== 'npx --yes depcheck@1.4.7 --ignores=bootstrap,bootstrap-icons,chart.js && cd frontend && npx --yes depcheck@1.4.7') {
    throw new Error('package.json deps:check must run pinned depcheck while ignoring only the admin browser vendor asset dependencies.');
  }
  [
    'node_modules/bootstrap/dist/css/bootstrap.min.css',
    'node_modules/bootstrap/dist/js/bootstrap.bundle.min.js',
    'node_modules/bootstrap-icons/font/bootstrap-icons.css',
    'node_modules/bootstrap-icons/font/fonts/bootstrap-icons.woff2',
    'node_modules/chart.js/dist/chart.umd.js'
  ].forEach((assetPath) => {
    if (!fs.existsSync(path.join(rootDir, assetPath))) {
      throw new Error(`Pinned admin vendor asset is missing: ${assetPath}`);
    }
  });

  if (/cdn\.jsdelivr|cdnjs|unpkg\.com|https:\/\/cdn/.test(adminViewSource)) {
    throw new Error('Admin EJS runtime views must not depend on external CDN assets.');
  }
  if (/\bfa-[A-Za-z0-9_-]+\b/.test(adminViewSource)) {
    throw new Error('Admin EJS runtime views must not keep Font Awesome utility classes when only Bootstrap Icons are loaded.');
  }
  [
    '/vendor/bootstrap/css/bootstrap.min.css',
    '/vendor/bootstrap-icons/bootstrap-icons.css',
    '/vendor/bootstrap/js/bootstrap.bundle.min.js'
  ].forEach((assetPath) => {
    if (!layoutSource.includes(assetPath) || !loginSource.includes(assetPath)) {
      throw new Error(`Admin layout and login page must both load local vendor asset: ${assetPath}`);
    }
  });
  [
    ['/vendor/chart.js/chart.umd.js', dashboardSource],
    ['/vendor/chart.js/chart.umd.js', statisticsSource]
  ].forEach(([assetPath, source]) => {
    if (!source.includes(assetPath)) {
      throw new Error(`Chart views must load local vendor asset: ${assetPath}`);
    }
  });

  [
    "'/vendor/bootstrap'",
    "'../node_modules/bootstrap/dist'",
    "'/vendor/bootstrap-icons'",
    "'../node_modules/bootstrap-icons/font'",
    "'/vendor/chart.js'",
    "'../node_modules/chart.js/dist'"
  ].forEach((needle) => {
    if (!serverSource.includes(needle)) {
      throw new Error(`server.js must expose local admin vendor asset path: ${needle}`);
    }
  });
  if (!/vendorStaticOptions[\s\S]*immutable[\s\S]*maxAge: '1y'/.test(serverSource)) {
    throw new Error('server.js must cache local vendor assets immutably in production.');
  }
  const flashMiddlewareIndex = serverSource.indexOf('app.use(createFlashMiddleware())');
  if (flashMiddlewareIndex === -1) {
    throw new Error('server.js must register flash middleware for admin views.');
  }
  [
    "app.use('/uploads'",
    "app.use(\n  '/vendor/bootstrap'",
    "app.use(\n  '/vendor/bootstrap-icons'",
    "app.use(\n  '/vendor/chart.js'",
    "app.use(express.static(path.join(__dirname, '../public')))"
  ].forEach((needle) => {
    const staticMiddlewareIndex = serverSource.indexOf(needle);
    if (staticMiddlewareIndex === -1) {
      throw new Error(`server.js must register static middleware: ${needle}`);
    }
    if (staticMiddlewareIndex > flashMiddlewareIndex) {
      throw new Error('server.js must serve static assets before flash middleware to avoid rotating CSRF sessions.');
    }
  });
  if (/stubExternalAdminAssets|cdn\.jsdelivr/.test(e2eBrowserSource)) {
    throw new Error('Browser E2E must exercise local admin vendor assets instead of stubbing CDN assets.');
  }

  console.log('ok admin vendor assets');
};

const verifyBrowserE2eContract = () => {
  const e2eBrowserSource = fs.readFileSync(path.join(rootDir, 'scripts/e2e-browser.js'), 'utf8');
  const auditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');

  if (
    /const connectDb\s*=|connectDb\(/.test(e2eBrowserSource) ||
    !/const connection = await mysql\.createConnection\(\{\s*host:\s*config\.dbHost,\s*port:\s*config\.dbPort,\s*user:\s*config\.dbUser,\s*password:\s*config\.dbPassword,\s*database:\s*config\.dbName\s*\}\);[\s\S]*SELECT o\.id, o\.total_price, o\.status, oi\.quantity, oi\.price_per_item, m\.name AS menu_name/.test(e2eBrowserSource)
  ) {
    throw new Error('Browser E2E must inline DB connection setup in verifyBrowserEffects without a single-use connectDb helper.');
  }
  if (!/e2e-browser\.js`의 `connectDb\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the browser E2E connectDb helper removal.');
  }

  console.log('ok browser E2E contract');
};

const verifyE2ePortConfigContract = () => {
  const e2eSource = fs.readFileSync(path.join(rootDir, 'scripts/e2e-db-api.js'), 'utf8');
  const e2eBrowserSource = fs.readFileSync(path.join(rootDir, 'scripts/e2e-browser.js'), 'utf8');
  const auditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');
  const operationsRunbookSource = fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8');
  const combinedSource = `${e2eSource}\n${e2eBrowserSource}`;

  if (/Number\(process\.env\.(?:DB_PORT|E2E_APP_PORT|E2E_FRONTEND_PORT|PORT)/.test(combinedSource)) {
    throw new Error('E2E runners must not use loose Number(process.env...) port parsing.');
  }
  [
    ['scripts/e2e-db-api.js', e2eSource],
    ['scripts/e2e-browser.js', e2eBrowserSource]
  ].forEach(([file, source]) => {
    if (!/if \(process\.argv\.length > 2\) \{\s*console\.error\('Usage: scripts\/e2e-[a-z-]+\.js'\);\s*process\.exit\(1\);\s*\}/.test(source)) {
      throw new Error(`${file} must reject unexpected positional arguments before DB reset or server setup.`);
    }
    const result = spawnSync(process.execPath, [file, 'unexpected'], {
      cwd: rootDir,
      env: {
        ...process.env,
        DB_HOST: '',
        DB_PORT: '',
        DB_USER: '',
        DB_PASSWORD: '',
        DB_NAME: '',
        E2E_ALLOW_UNSAFE_DB: ''
      },
      encoding: 'utf8',
      timeout: 10000
    });
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.status === 0 || !output.includes(`Usage: ${file}`)) {
      throw new Error(`${file} should reject unexpected positional arguments before DB reset or server setup:\n${output}`);
    }
    if (/Refusing to reset DB_NAME|E2E_ALLOW_UNSAFE_DB|ECONNREFUSED|ok DB\/API E2E|ok browser E2E/.test(output)) {
      throw new Error(`${file} must reject unexpected positional arguments before DB validation, DB reset, or server setup.`);
    }
  });
  if (
    !/const parsePort = \(value, fallback, envName\) => \{[\s\S]*const port = \/\^\[1-9\]\[0-9\]\*\$\/\.test\(text\) \? Number\(text\) : null;[\s\S]*if \(!Number\.isSafeInteger\(port\) \|\| port > 65535\) \{[\s\S]*throw new Error\(`\$\{envName\} must be a positive integer between 1 and 65535\.`\);[\s\S]*return port;[\s\S]*\};/.test(e2eSource) ||
    !/dbPort:\s*parsePort\(process\.env\.DB_PORT, 3306, 'DB_PORT'\)/.test(e2eSource) ||
    !/const appPortEnv = process\.env\.E2E_APP_PORT \|\| process\.env\.PORT;[\s\S]*const appPortEnvName = process\.env\.E2E_APP_PORT \? 'E2E_APP_PORT' : 'PORT';[\s\S]*appPort:\s*parsePort\(appPortEnv, 3100, appPortEnvName\)/.test(e2eSource) ||
    !/const allowUnsafeDb = process\.env\.E2E_ALLOW_UNSAFE_DB;[\s\S]*allowUnsafeDb !== undefined && allowUnsafeDb !== '' && allowUnsafeDb !== '0' && allowUnsafeDb !== '1'[\s\S]*throw new Error\('E2E_ALLOW_UNSAFE_DB must be 0 or 1\.'\);[\s\S]*if \(allowUnsafeDb === '1'\) return;/.test(e2eSource)
  ) {
    throw new Error('DB/API E2E must strictly validate DB_PORT/E2E_APP_PORT/PORT and E2E_ALLOW_UNSAFE_DB before DB or server setup.');
  }
  if (
    !/const parsePort = \(value, fallback, envName\) => \{[\s\S]*const port = \/\^\[1-9\]\[0-9\]\*\$\/\.test\(text\) \? Number\(text\) : null;[\s\S]*if \(!Number\.isSafeInteger\(port\) \|\| port > 65535\) \{[\s\S]*throw new Error\(`\$\{envName\} must be a positive integer between 1 and 65535\.`\);[\s\S]*return port;[\s\S]*\};/.test(e2eBrowserSource) ||
    !/dbPort:\s*parsePort\(process\.env\.DB_PORT, 3306, 'DB_PORT'\)/.test(e2eBrowserSource) ||
    !/appPort:\s*parsePort\(process\.env\.E2E_APP_PORT, 3101, 'E2E_APP_PORT'\)/.test(e2eBrowserSource) ||
    !/frontendPort:\s*parsePort\(process\.env\.E2E_FRONTEND_PORT, 5174, 'E2E_FRONTEND_PORT'\)/.test(e2eBrowserSource) ||
    !/const allowUnsafeDb = process\.env\.E2E_ALLOW_UNSAFE_DB;[\s\S]*allowUnsafeDb !== undefined && allowUnsafeDb !== '' && allowUnsafeDb !== '0' && allowUnsafeDb !== '1'[\s\S]*throw new Error\('E2E_ALLOW_UNSAFE_DB must be 0 or 1\.'\);[\s\S]*if \(allowUnsafeDb === '1'\) return;/.test(e2eBrowserSource)
  ) {
    throw new Error('Browser E2E must strictly validate DB_PORT/E2E_APP_PORT/E2E_FRONTEND_PORT and E2E_ALLOW_UNSAFE_DB before DB or server setup.');
  }
  if (
    !/adminUsername:\s*process\.env\.E2E_ADMIN_USERNAME \|\| 'e2e_admin'/.test(e2eSource) ||
    !/adminPassword:\s*process\.env\.E2E_ADMIN_PASSWORD \|\| 'e2e_admin_password'/.test(e2eSource) ||
    !/uploadDir:\s*process\.env\.E2E_UPLOAD_DIR \|\| fs\.mkdtempSync\(path\.join\(os\.tmpdir\(\), 'aiosk-e2e-uploads-'\)\)/.test(e2eSource) ||
    !/removeUploadDir:\s*!process\.env\.E2E_UPLOAD_DIR/.test(e2eSource) ||
    !/adminUsername:\s*process\.env\.E2E_ADMIN_USERNAME \|\| 'browser_e2e_admin'/.test(e2eBrowserSource) ||
    !/adminPassword:\s*process\.env\.E2E_ADMIN_PASSWORD \|\| 'browser_e2e_admin_password'/.test(e2eBrowserSource)
  ) {
    throw new Error('E2E runners must keep the documented admin seed and upload directory env contract.');
  }

  [
    ['scripts/e2e-db-api.js', { DB_PORT: '3306abc' }, 'DB_PORT'],
    ['scripts/e2e-db-api.js', { E2E_APP_PORT: '3100abc' }, 'E2E_APP_PORT'],
    ['scripts/e2e-db-api.js', { PORT: '3100abc' }, 'PORT'],
    ['scripts/e2e-browser.js', { DB_PORT: '3306abc' }, 'DB_PORT'],
    ['scripts/e2e-browser.js', { E2E_APP_PORT: '3101abc' }, 'E2E_APP_PORT'],
    ['scripts/e2e-browser.js', { E2E_FRONTEND_PORT: '5174abc' }, 'E2E_FRONTEND_PORT']
  ].forEach(([file, env, envName]) => {
    const result = spawnSync(process.execPath, [file], {
      cwd: rootDir,
      env: {
        ...process.env,
        DB_HOST: '127.0.0.1',
        DB_USER: 'root',
        DB_PASSWORD: 'root',
        DB_NAME: 'aiosk_e2e_port_contract',
        E2E_ALLOW_UNSAFE_DB: '1',
        ...env
      },
      encoding: 'utf8',
      timeout: 10000
    });

    if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes(`${envName} must be a positive integer between 1 and 65535.`)) {
      throw new Error(`${file} should reject invalid ${envName} before DB or server setup:\n${result.stdout}\n${result.stderr}`);
    }
  });

  [
    ['scripts/e2e-db-api.js', 'kiosk_db'],
    ['scripts/e2e-browser.js', 'kiosk_db']
  ].forEach(([file, dbName]) => {
    const result = spawnSync(process.execPath, [file], {
      cwd: rootDir,
      env: {
        ...process.env,
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        DB_USER: 'root',
        DB_PASSWORD: 'root',
        DB_NAME: dbName,
        E2E_ALLOW_UNSAFE_DB: 'true'
      },
      encoding: 'utf8',
      timeout: 10000
    });

    if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes('E2E_ALLOW_UNSAFE_DB must be 0 or 1.')) {
      throw new Error(`${file} should reject invalid E2E_ALLOW_UNSAFE_DB before DB setup:\n${result.stdout}\n${result.stderr}`);
    }
  });

  if (!/E2E runner port parsing/.test(auditSource) || !/E2E_ALLOW_UNSAFE_DB/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document strict E2E runner port and unsafe DB override parsing.');
  }
  if (!/E2E runner positional arguments fail before DB reset or server setup/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document that unexpected E2E runner positional arguments fail before DB reset or server setup.');
  }
  if (
    !/`E2E_ADMIN_USERNAME`과 `E2E_ADMIN_PASSWORD`로 seed 관리자 계정/.test(operationsRunbookSource) ||
    !/DB\/API E2E runner만 `E2E_UPLOAD_DIR`를 받는다/.test(operationsRunbookSource) ||
    !/OS temporary upload dir/.test(operationsRunbookSource) ||
    !/caller가 해당 directory cleanup/.test(operationsRunbookSource)
  ) {
    throw new Error('OPERATIONS_RUNBOOK.md must document E2E admin seed credentials and upload directory env behavior.');
  }
  if (!/E2E admin seed\/upload env contract/.test(auditSource) || !/E2E_UPLOAD_DIR/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the E2E admin seed/upload env contract.');
  }

  console.log('ok E2E port config contract');
};

const verifyAdminFlashMiddlewareContract = () => {
  const serverSource = fs.readFileSync(path.join(rootDir, 'src/server.js'), 'utf8');
  const flashMiddlewareSource = fs.readFileSync(path.join(rootDir, 'src/middleware/flash.middleware.js'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'));
  const { createFlashMiddleware } = require('../src/middleware/flash.middleware');
  const flashSessionKey = 'flash';

  if (packageJson.dependencies['connect-flash'] || packageLock.packages?.['node_modules/connect-flash']) {
    throw new Error('connect-flash must not be used; admin flash messages use the local session flash middleware.');
  }
  if (/require\(['"]connect-flash['"]\)|app\.use\(flash\(\)\)/.test(serverSource)) {
    throw new Error('server.js must not register the deprecated connect-flash middleware.');
  }
  if (!/require\(['"]\.\/middleware\/flash\.middleware['"]\)/.test(serverSource) || !/app\.use\(createFlashMiddleware\(\)\)/.test(serverSource)) {
    throw new Error('server.js must use the local admin flash middleware.');
  }
  if (!/function flash\(type, message\)/.test(flashMiddlewareSource) || !/arguments\.length < 2/.test(flashMiddlewareSource)) {
    throw new Error('local flash middleware must distinguish reads from writes using a normal function arguments object.');
  }
  if (!/const FLASH_SESSION_KEY = 'flash';/.test(flashMiddlewareSource) || /module\.exports = \{[\s\S]*FLASH_SESSION_KEY/.test(flashMiddlewareSource)) {
    throw new Error('local flash middleware must keep the session key internal instead of exporting test-only state.');
  }
  const inlineSessionGuards = flashMiddlewareSource.match(/if \(!req\.session\) \{\s*throw new Error\('Flash middleware requires session middleware\.'\);\s*\}/g) || [];
  if (/const assertSession\s*=|assertSession\(/.test(flashMiddlewareSource) || inlineSessionGuards.length !== 2) {
    throw new Error('local flash middleware must inline the private session guard in the read and write branches.');
  }
  if (/const normalizeMessages\s*=|const clearEmptyBucket\s*=|const getFlashBucket\s*=|const getExistingFlashBucket\s*=|normalizeMessages\(|clearEmptyBucket\(|getFlashBucket\(|getExistingFlashBucket\(/.test(flashMiddlewareSource) || !/const bucket = req\.session\[FLASH_SESSION_KEY\];\s*if \(!bucket \|\| typeof bucket !== 'object' \|\| Array\.isArray\(bucket\)\) return \[\];/.test(flashMiddlewareSource) || !/if \(!req\.session\[FLASH_SESSION_KEY\] \|\| typeof req\.session\[FLASH_SESSION_KEY\] !== 'object' \|\| Array\.isArray\(req\.session\[FLASH_SESSION_KEY\]\)\) \{\s*req\.session\[FLASH_SESSION_KEY\] = \{\};\s*\}\s*const bucket = req\.session\[FLASH_SESSION_KEY\];/.test(flashMiddlewareSource) || !/const messages = \(Array\.isArray\(message\) \? message : \[message\]\)\.map\(entry => String\(entry\)\);/.test(flashMiddlewareSource) || !/if \(Object\.keys\(bucket\)\.length === 0\) \{\s*delete req\.session\[FLASH_SESSION_KEY\];\s*\}/.test(flashMiddlewareSource)) {
    throw new Error('local flash middleware must not keep single-use flash bucket or message wrappers.');
  }

  const req = { session: {} };
  let nextCalled = false;
  createFlashMiddleware()(req, {}, () => {
    nextCalled = true;
  });
  if (!nextCalled || typeof req.flash !== 'function') {
    throw new Error('local flash middleware must attach req.flash and call next.');
  }
  if (req.flash('error').length !== 0 || req.session[flashSessionKey]) {
    throw new Error('local flash middleware must not create a session flash bucket on empty reads.');
  }
  if (req.flash('success', 'created') !== 1) {
    throw new Error('local flash middleware must return the message count when writing.');
  }
  if (req.session[flashSessionKey]?.success?.[0] !== 'created') {
    throw new Error('local flash middleware must persist messages in the session.');
  }
  const messages = req.flash('success');
  if (messages.length !== 1 || messages[0] !== 'created') {
    throw new Error('local flash middleware must read queued messages.');
  }
  if (req.session[flashSessionKey]) {
    throw new Error('local flash middleware must clear messages after reading.');
  }
  const missingSessionReq = {};
  createFlashMiddleware()(missingSessionReq, {}, () => {});
  try {
    missingSessionReq.flash('error', 'missing-session');
    throw new Error('missing-session-write-did-not-throw');
  } catch (error) {
    if (!/Flash middleware requires session middleware\./.test(error.message)) {
      throw new Error('local flash middleware must fail clearly when session middleware is missing.');
    }
  }

  console.log('ok admin flash middleware');
};

const verifyFrontendPublicSurface = () => {
  const frontendSources = walk(path.join(rootDir, 'frontend/src'), (filePath) => (
    filePath.endsWith('.ts') || filePath.endsWith('.tsx')
  ));
  const publicApiSource = fs.readFileSync(path.join(rootDir, 'frontend/src/services/publicApi.ts'), 'utf8');
  const mockDataSource = fs.readFileSync(path.join(rootDir, 'frontend/src/data/mockData.ts'), 'utf8');
  const frontendTypesSource = fs.readFileSync(path.join(rootDir, 'frontend/src/types/index.ts'), 'utf8');
  const appSource = fs.readFileSync(path.join(rootDir, 'frontend/src/App.tsx'), 'utf8');
  const kioskFeedbackSource = fs.readFileSync(path.join(rootDir, 'frontend/src/utils/kioskFeedback.ts'), 'utf8');
  const kioskPageSource = fs.readFileSync(path.join(rootDir, 'frontend/src/pages/KioskPage.tsx'), 'utf8');
  const categoryNavSource = fs.readFileSync(path.join(rootDir, 'frontend/src/components/kiosk/CategoryNav.tsx'), 'utf8');
  const orderReceiptSource = fs.readFileSync(path.join(rootDir, 'frontend/src/components/kiosk/OrderReceipt.tsx'), 'utf8');
  const printUtilsSource = fs.readFileSync(path.join(rootDir, 'frontend/src/utils/printUtils.ts'), 'utf8');
  const buttonSource = fs.readFileSync(path.join(rootDir, 'frontend/src/components/ui/Button.tsx'), 'utf8');
  const menuGridSource = fs.readFileSync(path.join(rootDir, 'frontend/src/components/kiosk/MenuGrid.tsx'), 'utf8');
  const shoppingCartSource = fs.readFileSync(path.join(rootDir, 'frontend/src/components/kiosk/ShoppingCart.tsx'), 'utf8');
  const cartSliceSource = fs.readFileSync(path.join(rootDir, 'frontend/src/store/slices/cartSlice.ts'), 'utf8');
  const frontendOrderConstantsSource = fs.readFileSync(path.join(rootDir, 'frontend/src/constants/order.ts'), 'utf8');
  const frontendIndexCssSource = fs.readFileSync(path.join(rootDir, 'frontend/src/index.css'), 'utf8');
  const frontendApiSource = fs.readFileSync(path.join(rootDir, 'frontend/src/services/api.ts'), 'utf8');
  const viteConfigSource = fs.readFileSync(path.join(rootDir, 'frontend/vite.config.ts'), 'utf8');
  const viteEnvSource = fs.readFileSync(path.join(rootDir, 'frontend/src/vite-env.d.ts'), 'utf8');
  const frontendTestReportSource = fs.readFileSync(path.join(rootDir, 'FRONTEND_TEST_REPORT.md'), 'utf8');
  const frontendTsconfigAppSource = fs.readFileSync(path.join(rootDir, 'frontend/tsconfig.app.json'), 'utf8');
  const frontendTsconfigNodeSource = fs.readFileSync(path.join(rootDir, 'frontend/tsconfig.node.json'), 'utf8');
  const frontendPackageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'frontend/package.json'), 'utf8'));
  const defaultPublicApiConsumers = frontendSources.filter((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    return /import\s+publicApi\s+from\s+['"][^'"]*services\/publicApi['"]/.test(source);
  });
  const unsupportedOrderStatusSources = frontendSources.filter((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    return /OrderQRCode|qrcode|\/order\/\$\{/.test(source);
  });
  const unsupportedKioskContractFieldSources = frontendSources.filter((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    return /\bisPopular\b|\bcustomerName\b|\bisActive\b|\bisAvailable\b|\bupdatedAt\b|category\?:\s*Category|sortOrder\?:|status\s*!==\s*'SOLD_OUT'|disabled=\{!menu\.isAvailable\}|품절/.test(source);
  });
  const runtimeReactDefaultImportSources = frontendSources.filter((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    return /^import\s+React(?:\s*,|\s+from\b)/m.test(source);
  });
  const reactFcAnnotationSources = frontendSources.filter((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    return /\bReact\.FC\b|import\s+type\s+\{[^}]*\bFC\b[^}]*\}\s+from\s+['"]react['"]|:\s*FC(?:<|\b)/.test(source);
  });
  const buttonWithoutVariantSources = frontendSources.filter((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    return /<Button\b(?:(?!variant=)[\s\S])*?>/.test(source);
  });

  if (/export\s+default\s+publicApi\s*;/.test(publicApiSource) || defaultPublicApiConsumers.length > 0) {
    throw new Error(`frontend publicApi must expose the named service only: ${defaultPublicApiConsumers.map(relative).join(', ')}`);
  }
  if (!/import\s+\{\s*publicApi\s*\}\s+from\s+['"]\.\.\/services\/publicApi['"]/.test(kioskPageSource)) {
    throw new Error('KioskPage must use the named publicApi import for kiosk status reporting.');
  }
  if (!/"jsx":\s*"react-jsx"/.test(frontendTsconfigAppSource) || runtimeReactDefaultImportSources.length > 0) {
    throw new Error(`Frontend uses automatic JSX runtime and must not keep runtime default React imports: ${runtimeReactDefaultImportSources.map(relative).join(', ')}`);
  }
  if (reactFcAnnotationSources.length > 0) {
    throw new Error(`Frontend components must not keep FC type helper annotations; type props directly at component boundaries: ${reactFcAnnotationSources.map(relative).join(', ')}`);
  }
  const frontendDeps = {
    ...frontendPackageJson.dependencies,
    ...frontendPackageJson.devDependencies
  };
  if (
    frontendDeps['react-router-dom'] ||
    /react-router-dom|BrowserRouter|Routes|Route|react:\s*\[/.test(`${appSource}\n${viteConfigSource}`) ||
    /KIOSK_PATHS/.test(appSource) ||
    /normalizePath/.test(appSource) ||
    !/const normalizedPath = window\.location\.pathname\.replace\(\/\\\/\+\$\/,\s*''\) \|\| '\/';[\s\S]*const shouldRenderKiosk = normalizedPath === '\/' \|\| normalizedPath === '\/kiosk';/.test(appSource)
  ) {
    throw new Error('Frontend must not keep React Router, single-use route constants/helpers, or the now-empty manual React chunk for the two static kiosk entry paths; App.tsx owns / and /kiosk directly.');
  }
  if (/manualChunks`?.*React, MUI|React, MUI, Redux/.test(frontendTestReportSource)) {
    throw new Error('FRONTEND_TEST_REPORT.md must not claim a React manual chunk after the empty React chunk was removed.');
  }
  const directMuiButtonConsumers = frontendSources.filter((filePath) => {
    if (relative(filePath) === 'frontend/src/components/ui/Button.tsx') return false;
    const source = fs.readFileSync(filePath, 'utf8');
    return /import\s+\{[^}]*\bButton\b[^}]*\}\s+from\s+['"]@mui\/material['"]/.test(source);
  });
  if (/h1:\s*\{/.test(appSource) || /MuiButton:\s*\{/.test(appSource) || directMuiButtonConsumers.length > 0) {
    throw new Error(`App theme must not keep unused h1 typography or duplicate MuiButton overrides; use the local Button wrapper instead: ${directMuiButtonConsumers.map(relative).join(', ')}`);
  }
  const directMuiCardConsumers = frontendSources.filter((filePath) => {
    if (relative(filePath) === 'frontend/src/components/kiosk/MenuGrid.tsx') return false;
    const source = fs.readFileSync(filePath, 'utf8');
    return /import\s+\{[^}]*\bCard\b[^}]*\}\s+from\s+['"]@mui\/material['"]/.test(source);
  });
  if (/MuiCard:\s*\{/.test(appSource) || directMuiCardConsumers.length > 0 || !/borderRadius: theme\.spacing\(2\)/.test(menuGridSource)) {
    throw new Error(`App theme must not keep duplicate MuiCard overrides; MenuGrid owns kiosk card radius locally: ${directMuiCardConsumers.map(relative).join(', ')}`);
  }
  if (/secondary:\s*\{[\s\S]*?main:\s*'#4CAF50'/.test(appSource) || /color=["']secondary["']|theme\.palette\.secondary|palette\.secondary/.test(`${appSource}\n${kioskPageSource}\n${categoryNavSource}\n${menuGridSource}\n${shoppingCartSource}\n${orderReceiptSource}\n${buttonSource}`)) {
    throw new Error('App theme must not keep an unused secondary palette override.');
  }
  if (/defaultOptions:\s*\{[\s\S]*staleTime:\s*5 \* 60 \* 1000/.test(appSource)) {
    throw new Error('QueryClient defaults must not keep staleTime when current queries declare staleTime at call sites.');
  }
  if (/이번 턴|재실행하지 않았/.test(frontendTestReportSource)) {
    throw new Error('FRONTEND_TEST_REPORT.md must use durable verification language instead of turn-relative status notes.');
  }
  const kioskStatusReportBlock = (frontendTypesSource.match(/export interface KioskStatusReport \{[\s\S]*?\n\}/) || [''])[0];
  const frontendMenuBlock = (frontendTypesSource.match(/export interface Menu \{[\s\S]*?\n\}/) || [''])[0];
  const publicMenuResponseBlock = (publicApiSource.match(/type PublicMenuResponse = \{[\s\S]*?\n\};/) || [''])[0];
  if (
    !/label:\s*string;/.test(kioskStatusReportBlock) ||
    /label\?:/.test(kioskStatusReportBlock) ||
    !/status:\s*'ONLINE' \| 'DEGRADED';/.test(kioskStatusReportBlock) ||
    /status\?:|MAINTENANCE|OFFLINE/.test(kioskStatusReportBlock)
  ) {
    throw new Error('Frontend KioskStatusReport must only expose required browser heartbeat fields sent by KioskPage.');
  }
  if (
    !/label:\s*'Browser Kiosk'/.test(kioskPageSource) ||
    !/status:\s*hasCatalogError \? 'DEGRADED' : 'ONLINE'/.test(kioskPageSource)
  ) {
    throw new Error('KioskPage heartbeat must report the required Browser Kiosk label and only ONLINE/DEGRADED browser statuses.');
  }
  if (/const getKioskId\s*=|getKioskId\(/.test(kioskPageSource) || !/const storageKey = 'aiosk:kiosk-id';/.test(kioskPageSource) || !/const existingId = window\.localStorage\.getItem\(storageKey\);/.test(kioskPageSource) || !/const kioskId = existingId \|\| `kiosk-\$\{globalThis\.crypto\?\.randomUUID\?\.\(\)/.test(kioskPageSource) || !/if \(!existingId\) \{\s*window\.localStorage\.setItem\(storageKey, kioskId\);\s*\}/.test(kioskPageSource)) {
    throw new Error('KioskPage heartbeat must keep kiosk id persistence inline without a single-use getKioskId wrapper.');
  }
  if (
    /getKioskStatusHeaders/.test(publicApiSource) ||
    !/VITE_KIOSK_STATUS_TOKEN/.test(publicApiSource) ||
    !/['"]x-kiosk-status-token['"]/.test(publicApiSource) ||
    !/const token = import\.meta\.env\.VITE_KIOSK_STATUS_TOKEN\?\.trim\(\);[\s\S]*apiClient\.post\(['"]\/api\/public\/kiosk\/status['"],\s*statusData,\s*\{[\s\S]*headers:\s*token \? \{ ['"]x-kiosk-status-token['"]:\s*token \} : undefined/.test(publicApiSource)
  ) {
    throw new Error('publicApi.reportKioskStatus must send the optional VITE_KIOSK_STATUS_TOKEN as x-kiosk-status-token without a single-use header helper.');
  }
  if (
    !/reference types="vite\/client"/.test(viteEnvSource) ||
    !/readonly VITE_APP_VERSION\?: string;/.test(viteEnvSource) ||
    !/readonly VITE_KIOSK_STATUS_TOKEN\?: string;/.test(viteEnvSource)
  ) {
    throw new Error('frontend vite-env.d.ts must keep Vite ambient env types for heartbeat app version and optional kiosk token.');
  }
  const frontendTsconfigApp = JSON.parse(frontendTsconfigAppSource);
  const frontendTsconfigNode = JSON.parse(frontendTsconfigNodeSource);
  [
    ['frontend/tsconfig.app.json', frontendTsconfigApp],
    ['frontend/tsconfig.node.json', frontendTsconfigNode]
  ].forEach(([configPath, config]) => {
    const compilerOptions = config.compilerOptions || {};
    if (compilerOptions.noUnusedLocals !== true || compilerOptions.noUnusedParameters !== true) {
      throw new Error(`${configPath} must keep noUnusedLocals and noUnusedParameters enabled for dead-code pruning.`);
    }
  });
  if (/categoryId:/.test(frontendMenuBlock) || /categoryId:/.test(publicMenuResponseBlock) || /menu\.categoryId/.test(publicApiSource)) {
    throw new Error('Frontend Menu and publicApi menu normalization must not keep categoryId after category filtering moved to query params and mock-private data.');
  }
  if (/Avenir|color-scheme:\s*light dark|#646cff|place-items:\s*center|button:hover|@media \(prefers-color-scheme: light\)|^\s*h1\s*\{/m.test(frontendIndexCssSource)) {
    throw new Error('frontend index.css must not keep Vite template typography, palette, centered-body, or button overrides.');
  }
  if (!/html,\s*\nbody,\s*\n#root\s*\{[\s\S]*min-width:\s*320px;[\s\S]*min-height:\s*100%;[\s\S]*\}/.test(frontendIndexCssSource) || !/body\s*\{[\s\S]*margin:\s*0;[\s\S]*\}/.test(frontendIndexCssSource)) {
    throw new Error('frontend index.css must keep only the minimal app root sizing and body reset.');
  }
  if (/export\s+const\s+mock(?:Categories|Menus)\b/.test(mockDataSource)) {
    throw new Error('Mock datasets must stay private to mockData.ts; expose helper functions instead.');
  }
  if (!/const\s+mockCategories:\s*Category\[\]\s*=/.test(mockDataSource) || !/type MockMenu = Menu & \{\s*categoryId: number;\s*\};/.test(mockDataSource) || !/const\s+mockMenus:\s*MockMenu\[\]\s*=/.test(mockDataSource)) {
    throw new Error('mockData.ts must keep mock datasets as private typed constants and keep categoryId mock-only.');
  }
  if (/shouldUseMockData/.test(`${mockDataSource}\n${publicApiSource}`) || !/export const mockDataEnabled = import\.meta\.env\.VITE_USE_MOCK_DATA === 'true';/.test(mockDataSource) || !/if \(mockDataEnabled\)/.test(publicApiSource)) {
    throw new Error('Frontend mock mode must use the exported mockDataEnabled boolean directly, not a no-op shouldUseMockData wrapper.');
  }
  if (!/export\s+const\s+getMockCategories\s*=/.test(mockDataSource) || !/getMockCategories\(\)/.test(publicApiSource)) {
    throw new Error('Public API mock category reads must go through getMockCategories().');
  }
  if (!/getMockMenuById\s*=\s*\(menuId: number\): Menu =>/.test(mockDataSource) || !/throw new Error\(`Mock menu not found: \$\{menuId\}`\)/.test(mockDataSource)) {
    throw new Error('Mock menu lookup must fail loudly instead of returning an undefined menu.');
  }
  if (/menu\?\.(?:price|name)|`메뉴 \$\{item\.menuId\}`/.test(publicApiSource)) {
    throw new Error('publicApi mock order creation must not synthesize fallback menu names or zero prices for unknown mock menus.');
  }
  if (/주문 생성 실패/.test(publicApiSource) || /catch\s*\(\s*error\s*\)\s*\{\s*console\.error[\s\S]*?throw\s+error\s*;?\s*\}/.test(publicApiSource)) {
    throw new Error('publicApi.ts must not keep redundant log-and-rethrow catch blocks; page-level mutations handle user feedback.');
  }
  const publicApiUsesStrictAmounts = [
    !/parseFloat\(|Number\.parseFloat\(/.test(publicApiSource),
    /const getRequiredNonNegativeAmount = \(value: number \| string, entity: string\): number => \{/.test(publicApiSource),
    /if \(typeof value === 'number' && Number\.isFinite\(value\) && value >= 0\) \{/.test(publicApiSource),
    publicApiSource.includes("const parsed = /^(0|[1-9][0-9]*)(\\.[0-9]+)?$/.test(text) ? Number(text) : null;"),
    /if \(parsed !== null && Number\.isFinite\(parsed\)\) \{/.test(publicApiSource),
    /throw new Error\(`\$\{entity\} 응답에 유효한 금액이 없습니다\.`\);/.test(publicApiSource)
  ].every(Boolean);
  if (!publicApiUsesStrictAmounts) {
    throw new Error('publicApi.ts must reject partial numeric strings in public menu/order amount responses.');
  }
  if (
    !/const getRequiredId = \(value: number \| undefined, entity: string\): number => \{[\s\S]*if \(!\(typeof value === 'number' && Number\.isSafeInteger\(value\) && value > 0\)\) \{[\s\S]*throw new Error\(`\$\{entity\} 응답에 유효한 ID가 없습니다\.`\);[\s\S]*return value;[\s\S]*\};/.test(publicApiSource) ||
    /Number\.isNaN\(value\)|typeof value !== 'number'/.test(publicApiSource)
  ) {
    throw new Error('publicApi.ts must reject non-positive or non-safe category/menu IDs in public responses.');
  }
  const publicCategoryMappingBlock = (publicApiSource.match(/const response = await apiClient\.get<PublicCategoryResponse\[\]>\('\/api\/public\/categories'\);[\s\S]*?return response\.data\.map\(\(category\) => \(\{[\s\S]*?\}\)\);/) || [''])[0];
  const publicMenuMappingBlock = (publicApiSource.match(/const response = await apiClient\.get<PublicMenuResponse\[\]>\('\/api\/public\/menus', \{ params \}\);[\s\S]*?return response\.data\.map\(\(menu\) => \(\{[\s\S]*?\}\)\);/) || [''])[0];
  if (
    /const normalize(?:Category|Menu)\s*=|map\(normalize(?:Category|Menu)\)/.test(publicApiSource) ||
    !/id: getRequiredId\(category\.categoryId, '카테고리'\)/.test(publicCategoryMappingBlock) ||
    !/name: category\.name/.test(publicCategoryMappingBlock) ||
    !/id: getRequiredId\(menu\.menuId, '메뉴'\)/.test(publicMenuMappingBlock) ||
    !/description: menu\.description \?\? ''/.test(publicMenuMappingBlock) ||
    !/price: getRequiredNonNegativeAmount\(menu\.price, '메뉴 가격'\)/.test(publicMenuMappingBlock) ||
    !/imageUrl: menu\.imageUrl \?\? undefined/.test(publicMenuMappingBlock)
  ) {
    throw new Error('publicApi category/menu reads must normalize responses inline without single-use normalizeCategory/normalizeMenu helpers.');
  }
  const createOrderItemBlock = (frontendTypesSource.match(/export interface CreateOrderItem \{[\s\S]*?\n\}/) || [''])[0];
  const orderItemBlock = (frontendTypesSource.match(/export interface OrderItem \{[\s\S]*?\n\}/) || [''])[0];
  const frontendOrderBlock = (frontendTypesSource.match(/export interface Order \{[\s\S]*?\n\}/) || [''])[0];
  if (
    !/menuId: number;/.test(createOrderItemBlock) ||
    !/quantity: number;/.test(createOrderItemBlock) ||
    /extends CreateOrderItem|menuId:/.test(orderItemBlock) ||
    !/menuName: string;/.test(orderItemBlock) ||
    !/quantity: number;/.test(orderItemBlock) ||
    !/price: number;/.test(orderItemBlock) ||
    !/pricePerItem: number;/.test(orderItemBlock) ||
    /menuId:\s*item\.menuId/.test(publicApiSource)
  ) {
    throw new Error('Frontend order types must keep menuId in create-order request items only; receipt/display order items expose only rendered fields.');
  }
  if (!/totalPrice:\s*number;/.test(frontendOrderBlock) || /status:/.test(frontendOrderBlock) || /PREPARING|COMPLETED|CANCELLED/.test(frontendOrderBlock) || !/createdAt:\s*string;/.test(frontendOrderBlock)) {
    throw new Error('Frontend Order type must only include public order response fields consumed by receipt rendering.');
  }
  if (
    /total(?:Items|Price):/.test(cartSliceSource) ||
    /calculateTotals/.test(cartSliceSource) ||
    /export interface CartItem/.test(frontendTypesSource) ||
    !/interface CartItem \{\s*menu: Menu;\s*quantity: number;\s*\}/.test(cartSliceSource) ||
    /item: CartItem/.test(`${shoppingCartSource}\n${kioskPageSource}`) ||
    !/const totalItems = items\.reduce\(\(sum, item\) => sum \+ item\.quantity, 0\);/.test(shoppingCartSource) ||
    !/const totalPrice = items\.reduce\(\(sum, item\) => sum \+ item\.menu\.price \* item\.quantity, 0\);/.test(shoppingCartSource) ||
    !/\(item\.menu\.price \* item\.quantity\)\.toLocaleString\(\)/.test(shoppingCartSource) ||
    !/const cartTotalItems = cartItems\.reduce\(\(sum, item\) => sum \+ item\.quantity, 0\);/.test(kioskPageSource) ||
    /cartItems\.length/.test(kioskPageSource) ||
    !/장바구니: \{cartTotalItems\}개/.test(kioskPageSource)
  ) {
    throw new Error('Cart totals must stay derived from item quantities at render time, not duplicated in Redux state or replaced by distinct line counts.');
  }
  if (
    !/export const MAX_ORDER_ITEMS = 100;/.test(frontendOrderConstantsSource) ||
    !/export const MAX_ORDER_ITEM_QUANTITY = 99;/.test(frontendOrderConstantsSource) ||
    /export const MAX_ORDER_ITEM_QUANTITY/.test(cartSliceSource) ||
    !/import \{ MAX_ORDER_ITEMS, MAX_ORDER_ITEM_QUANTITY \} from '\.\.\/\.\.\/constants\/order';/.test(cartSliceSource) ||
    !/if \(!Number\.isSafeInteger\(quantity\) \|\| quantity <= 0\) \{\s*return;\s*\}/.test(cartSliceSource) ||
    !/const boundedQuantity = Math\.min\(quantity, MAX_ORDER_ITEM_QUANTITY\);/.test(cartSliceSource) ||
    !/state\.items\[existingItemIndex\]\.quantity = Math\.min\(\s*MAX_ORDER_ITEM_QUANTITY,\s*state\.items\[existingItemIndex\]\.quantity \+ boundedQuantity\s*\);/.test(cartSliceSource) ||
    !/if \(state\.items\.length >= MAX_ORDER_ITEMS\) \{\s*return;\s*\}/.test(cartSliceSource) ||
    !/quantity:\s*boundedQuantity/.test(cartSliceSource) ||
    !/if \(!Number\.isSafeInteger\(quantity\)\) \{\s*return;\s*\}/.test(cartSliceSource) ||
    !/state\.items\[itemIndex\]\.quantity = Math\.min\(quantity, MAX_ORDER_ITEM_QUANTITY\);/.test(cartSliceSource) ||
    !/import \{ addItem, clearCart \} from '\.\.\/store\/slices\/cartSlice';/.test(kioskPageSource) ||
    !/import \{ MAX_ORDER_ITEM_QUANTITY \} from '\.\.\/constants\/order';/.test(kioskPageSource) ||
    !/setQuantity\(\(currentQuantity\) => Math\.min\(MAX_ORDER_ITEM_QUANTITY, currentQuantity \+ 1\)\)/.test(kioskPageSource) ||
    !/disabled=\{quantity >= MAX_ORDER_ITEM_QUANTITY\}/.test(kioskPageSource) ||
    !/import \{ updateQuantity, removeItem \} from '\.\.\/\.\.\/store\/slices\/cartSlice';/.test(shoppingCartSource) ||
    !/import \{ MAX_ORDER_ITEM_QUANTITY \} from '\.\.\/\.\.\/constants\/order';/.test(shoppingCartSource) ||
    !/quantity:\s*Math\.min\(MAX_ORDER_ITEM_QUANTITY, item\.quantity \+ 1\)/.test(shoppingCartSource) ||
    !/disabled=\{item\.quantity >= MAX_ORDER_ITEM_QUANTITY\}/.test(shoppingCartSource) ||
    !/import \{ MAX_ORDER_ITEMS, MAX_ORDER_ITEM_QUANTITY \} from '\.\.\/constants\/order';/.test(publicApiSource)
  ) {
    throw new Error('Cart state, publicApi, and kiosk quantity controls must use the shared public order bounds.');
  }
  const publicOrderItemResponseBlock = (publicApiSource.match(/type PublicOrderItemResponse = \{[\s\S]*?\n\};/) || [''])[0];
  const publicOrderResponseBlock = (publicApiSource.match(/type PublicOrderResponse = \{[\s\S]*?\n\};/) || [''])[0];
  if (
    !/menuName: string;/.test(publicOrderItemResponseBlock) ||
    !/quantity: number;/.test(publicOrderItemResponseBlock) ||
    !/price: number \| string;/.test(publicOrderItemResponseBlock) ||
    !/pricePerItem: number \| string;/.test(publicOrderItemResponseBlock) ||
    !/items: PublicOrderItemResponse\[\];/.test(publicOrderResponseBlock) ||
    !/totalPrice: number \| string;/.test(publicOrderResponseBlock) ||
    /status:/.test(publicOrderResponseBlock) ||
    !/createdAt: string;/.test(publicOrderResponseBlock)
  ) {
    throw new Error('publicApi PublicOrderResponse must not carry status and must expose raw order item amount fields for explicit receipt normalization.');
  }
  if (
    /const normalizeOrder\s*=|normalizeOrder\(/.test(publicApiSource) ||
    /orderId: response\.data\.orderId|items: response\.data\.items,/.test(publicApiSource) ||
    !/const getRequiredOrderItemQuantity = \(value: number, entity: string\): number => \{[\s\S]*value > 0 && value <= MAX_ORDER_ITEM_QUANTITY[\s\S]*throw new Error\(`\$\{entity\}에 유효한 수량이 없습니다\.`\);[\s\S]*return value;[\s\S]*\};/.test(publicApiSource) ||
    !/const response = await apiClient\.post<PublicOrderResponse>\('\/api\/public\/orders', \{ items: requestItems \}\);[\s\S]*return \{[\s\S]*orderId: getRequiredId\(response\.data\.orderId, '주문'\),[\s\S]*items: response\.data\.items\.map\(\(item\) => \{[\s\S]*const quantity = getRequiredOrderItemQuantity\(item\.quantity, '주문 항목 응답'\);[\s\S]*menuName: item\.menuName,[\s\S]*quantity,[\s\S]*pricePerItem: getRequiredNonNegativeAmount\(item\.pricePerItem, '주문 항목 단가'\),[\s\S]*price: getRequiredNonNegativeAmount\(item\.price, '주문 항목 금액'\)[\s\S]*totalPrice: getRequiredNonNegativeAmount\(response\.data\.totalPrice, '주문 합계'\),[\s\S]*createdAt: response\.data\.createdAt[\s\S]*\};/.test(publicApiSource)
  ) {
    throw new Error('publicApi.createOrder must normalize public order IDs, item quantities, and item/order amounts inline without a single-use normalizeOrder helper.');
  }
  if (
    !/createOrder:\s*async \(orderData: \{ items: CreateOrderItem\[\] \}\)/.test(publicApiSource) ||
    !/const orderItems = Array\.isArray\(orderData\?\.items\) \? orderData\.items : \[\];[\s\S]*if \(orderItems\.length === 0 \|\| orderItems\.length > MAX_ORDER_ITEMS\)/.test(publicApiSource) ||
    !/const requestItems: CreateOrderItem\[\] = orderItems\.map\(\(item\) => \{[\s\S]*const menuId = item\.menuId;[\s\S]*Number\.isSafeInteger\(menuId\) && menuId > 0[\s\S]*const quantity = getRequiredOrderItemQuantity\(item\.quantity, '주문 항목 요청'\);[\s\S]*return \{ menuId, quantity \};[\s\S]*\}\);/.test(publicApiSource) ||
    !/const mockItems: OrderItem\[\] = requestItems\.map/.test(publicApiSource)
  ) {
    throw new Error('publicApi.createOrder must validate menuId/quantity request items and enrich mock responses from validated requestItems.');
  }
  if (fs.existsSync(path.join(rootDir, 'frontend/src/hooks/usePublicApi.ts')) || /hooks\/usePublicApi|useCategories|useMenus|useCreateOrder/.test(kioskPageSource) || !/useQuery<Category\[\]>\(\{[\s\S]*queryKey: \['categories'\][\s\S]*queryFn: publicApi\.getCategories[\s\S]*staleTime: 5 \* 60 \* 1000/.test(kioskPageSource) || !/useQuery<Menu\[\]>\(\{[\s\S]*queryKey: \['menus', selectedCategoryId \|\| undefined\][\s\S]*queryFn: \(\) => publicApi\.getMenus\(selectedCategoryId \|\| undefined\)[\s\S]*staleTime: 2 \* 60 \* 1000/.test(kioskPageSource) || !/useMutation\(\{[\s\S]*mutationFn: \(orderData: \{ items: CreateOrderItem\[\] \}\) => publicApi\.createOrder\(orderData\)/.test(kioskPageSource)) {
    throw new Error('KioskPage must own its single-consumer React Query public API calls without usePublicApi wrapper hooks.');
  }
  if (!/const orderItems: CreateOrderItem\[\] = cartItems\.map/.test(kioskPageSource) || /const orderItems: OrderItem\[\]/.test(kioskPageSource) || /menuName:\s*item\.menu\.name|pricePerItem:\s*item\.menu\.price|price:\s*item\.menu\.price/.test(kioskPageSource)) {
    throw new Error('KioskPage must not send receipt-only menu fields in the public create-order request body.');
  }
  if (/result\.totalPrice\s*\?\?|result\.createdAt\s*\?\?|const totalPrice = cartItems\.reduce|setCompletedOrder\(enrichedOrder\)/.test(kioskPageSource)) {
    throw new Error('KioskPage must not enrich required public order response fields already normalized by publicApi.');
  }
  if (
    /orderSuccess|setOrderSuccess|주문 완료 알림 \(오류 시에만 사용\)/.test(kioskPageSource) ||
    !/const \[orderErrorOpen, setOrderErrorOpen\] = useState\(false\);/.test(kioskPageSource) ||
    !/<Snackbar[\s\S]*open=\{orderErrorOpen\}[\s\S]*onClose=\{\(\) => setOrderErrorOpen\(false\)\}[\s\S]*<Alert[\s\S]*onClose=\{\(\) => setOrderErrorOpen\(false\)\}[\s\S]*severity="error"/.test(kioskPageSource)
  ) {
    throw new Error('KioskPage order failure snackbar must use explicit error state, not a stale success state name.');
  }
  if (/item\.menuName \|\| `메뉴 \$\{item\.menuId\}`|item\.pricePerItem \?|item\.price \?/.test(`${orderReceiptSource}\n${printUtilsSource}\n${kioskPageSource}`)) {
    throw new Error('Frontend receipt rendering must not keep stale fallback fields after public order responses provide display items.');
  }
  if (/order(?:Data)?\.orderId \|\| ''|order\.totalPrice\?\.|order(?:Data)?\.totalPrice \|\| 0|item\.quantity \|\| 0|order\.createdAt \? formatDate/.test(`${orderReceiptSource}\n${printUtilsSource}`)) {
    throw new Error('Frontend receipt rendering must not fallback required public order response fields.');
  }
  if (/Number\(item\.(?:quantity|pricePerItem|price)\)|Number\(orderData\.totalPrice\)/.test(printUtilsSource)) {
    throw new Error('printReceipt must not re-coerce numeric fields already normalized into the Order type.');
  }
  if (
    /import type \{ Order, OrderItem \} from ['"]\.\.\/types['"]/.test(printUtilsSource) ||
    /orderData\.items\.map\(\(item:\s*OrderItem\)/.test(printUtilsSource) ||
    !/import type \{ Order \} from ['"]\.\.\/types['"];/.test(printUtilsSource) ||
    !/const quantity = item\.quantity\.toLocaleString\(\);/.test(printUtilsSource) ||
    !/const pricePerItem = item\.pricePerItem\.toLocaleString\(\);/.test(printUtilsSource) ||
    !/const itemPrice = item\.price\.toLocaleString\(\);/.test(printUtilsSource) ||
    !/\$\{orderData\.totalPrice\.toLocaleString\(\)\}원/.test(printUtilsSource)
  ) {
    throw new Error('printReceipt must use the Order item numeric contract directly without redundant OrderItem annotations.');
  }
  if (
    /new Date\(\)\.toLocaleString\('ko-KR'\)|currentTime/.test(printUtilsSource) ||
    !/const orderTime = escapeHtml\(new Date\(orderData\.createdAt\)\.toLocaleString\('ko-KR', \{[\s\S]*year: 'numeric',[\s\S]*month: '2-digit',[\s\S]*day: '2-digit',[\s\S]*hour: '2-digit',[\s\S]*minute: '2-digit',[\s\S]*\}\)\);/.test(printUtilsSource) ||
    !/주문시간: \$\{orderTime\}/.test(printUtilsSource)
  ) {
    throw new Error('printReceipt must use the required orderData.createdAt timestamp instead of stamping print time.');
  }
  if (/\bformatDate\b/.test(orderReceiptSource)) {
    throw new Error('OrderReceipt must not keep a single-use date formatting wrapper; render the required createdAt field directly.');
  }
  if (
    /import \{ styled \} from ['"]@mui\/material\/styles['"]|const Receipt(?:Container|Header|Item)\s*=|<Receipt(?:Container|Header|Item)\b/.test(orderReceiptSource) ||
    /return\s*\(\s*<Box>\s*\{\/\*\s*디지털 영수증\s*\*\//.test(orderReceiptSource) ||
    !/<Paper[\s\S]*elevation=\{3\}[\s\S]*sx=\{\{[\s\S]*border: '2px dashed #e0e0e0'/.test(orderReceiptSource) ||
    !/<ListItem[\s\S]*sx=\{\{[\s\S]*justifyContent: 'space-between'/.test(orderReceiptSource)
  ) {
    throw new Error('OrderReceipt must not keep single-use styled wrappers or a prop-less root Box around receipt content.');
  }
  if (/order\.status\s*===|:\s*order\.status|status:\s*'RECEIVED'|PREPARING|COMPLETED|CANCELLED/.test(`${orderReceiptSource}\n${publicApiSource}\n${frontendOrderBlock}`) || !/label="주문 접수"/.test(orderReceiptSource)) {
    throw new Error('Frontend public order receipt must not carry unused public/admin order-status fields.');
  }
  if (
    /onPrintReceipt\?:|onPrint\?:|\{onPrint &&|window\.print\(\)/.test(`${orderReceiptSource}\n${kioskPageSource}`) ||
    !/onPrint=\{\(\) => \{[\s\S]*printReceipt\(completedOrder\);[\s\S]*KioskSoundManager\.playClickSound\(\);[\s\S]*KioskHapticManager\.triggerClick\(\);[\s\S]*\}\}/.test(kioskPageSource)
  ) {
    throw new Error('Order receipt print path must stay explicit; completed orders always pass the printReceipt callback.');
  }
  if (
    /if \(!completedOrder\) return|const handlePrintReceipt/.test(kioskPageSource) ||
    !/onPrint=\{\(\) => \{[\s\S]*printReceipt\(completedOrder\);[\s\S]*KioskSoundManager\.playClickSound\(\);[\s\S]*KioskHapticManager\.triggerClick\(\);[\s\S]*\}\}/.test(kioskPageSource)
  ) {
    throw new Error('KioskPage must not keep a single-use print receipt wrapper; completed-order print side effects stay inline in the completed-order branch.');
  }
  if (/const handleOrderComplete = \(\) => \{\s*setCompletedOrder\(null\);\s*\};/.test(kioskPageSource) || /onClose=\{handleOrderComplete\}/.test(kioskPageSource)) {
    throw new Error('KioskPage must not keep a no-op completed-order close wrapper around setCompletedOrder(null).');
  }
  if (/const handleMenuSelect =|onMenuSelect=\{handleMenuSelect\}/.test(kioskPageSource) || !/onMenuSelect=\{\(menu\) => \{[\s\S]*setSelectedMenu\(menu\);[\s\S]*setQuantity\(1\);[\s\S]*\}\}/.test(kioskPageSource)) {
    throw new Error('KioskPage must not keep a single-use handleMenuSelect wrapper around selected-menu state updates.');
  }
  if (
    /import \{ styled \} from ['"]@mui\/material\/styles['"]|KioskContainer|MainContent|MenuSection|CartSection/.test(kioskPageSource) ||
    !/<Box[\s\S]*sx=\{\{[\s\S]*minHeight: '100vh'[\s\S]*backgroundColor: 'grey\.50'/.test(kioskPageSource) ||
    !/<Container[\s\S]*sx=\{\{[\s\S]*maxWidth: '1400px !important'/.test(kioskPageSource) ||
    !/<Box sx=\{\{ flex: 1, minWidth: 0 \}\}>/.test(kioskPageSource) ||
    !/<Box sx=\{\{ width: 350, flexShrink: 0 \}\}>/.test(kioskPageSource)
  ) {
    throw new Error('KioskPage must not keep single-use styled layout wrappers; page layout styles belong on local sx props.');
  }
  if (/export interface ApiError|interface ApiError|import type \{[^}]*ApiError|statusCode\?:|response\?\.data\?\.error/.test(`${frontendTypesSource}\n${frontendApiSource}`) || !/return Promise\.reject\(new Error\(error\.response\?\.data\?\.message \|\| error\.message \|\| '알 수 없는 오류가 발생했습니다\.'\)\);/.test(frontendApiSource)) {
    throw new Error('frontend API client must not keep unused ApiError detail fields; current UI consumes only error state and optional message.');
  }
  if (/handleApiResponse/.test(`${frontendApiSource}\n${publicApiSource}`)) {
    throw new Error('frontend API client must not keep a no-op handleApiResponse helper; use Axios response.data directly at call sites.');
  }
  if (/interface ButtonProps extends MuiButtonProps \{[\s\S]*\b(?:variant|size)\?:/.test(buttonSource) || !/isKiosk\?: boolean/.test(buttonSource)) {
    throw new Error('Button wrapper props must only declare local isKiosk; MUI already owns variant/size typing.');
  }
  if (/const StyledButton\s*=|<StyledButton|const Button = \(\{[\s\S]*\}\s*:\s*ButtonProps\) =>/.test(buttonSource) || !/const Button = styled\(MuiButton,[\s\S]*\)<ButtonProps>/.test(buttonSource)) {
    throw new Error('Button wrapper must not keep a no-op component around the styled MUI Button; export the styled button directly.');
  }
  if (!/shouldForwardProp:\s*\(prop\) => !\['as', 'isKiosk', 'ownerState', 'sx', 'theme'\]\.includes\(String\(prop\)\)/.test(buttonSource)) {
    throw new Error('Button styled component must not forward style-only isKiosk or MUI internal styled props to the DOM.');
  }
  if (/size\s*=\s*['"]medium['"]|size=\{size\}|isKiosk\s*=\s*false|variant\s*=\s*['"]contained['"]|variant=\{variant\}/.test(buttonSource) || buttonWithoutVariantSources.length > 0) {
    throw new Error(`Button wrapper must not duplicate MUI Button size/default handling or hide caller variant intent: ${buttonWithoutVariantSources.map(relative).join(', ')}`);
  }
  if (/const\s+currentValue\s*=\s*selectedCategoryId/.test(categoryNavSource) || /value=\{currentValue\}/.test(categoryNavSource)) {
    throw new Error('CategoryNav must not keep a no-op selectedCategoryId alias for Tabs value.');
  }
  if (/handleChange|SyntheticEvent/.test(categoryNavSource) || !/onChange=\{\(_, newValue: number \| null\) => onCategorySelect\(newValue\)\}/.test(categoryNavSource)) {
    throw new Error('CategoryNav must not keep a local change wrapper that only forwards Tabs newValue.');
  }
  if (
    /import \{ styled \} from ['"]@mui\/material\/styles['"]|StyledTabs|StyledTab/.test(categoryNavSource) ||
    /import \{[^}]*\bBox\b[^}]*\} from ['"]@mui\/material['"]/.test(categoryNavSource) ||
    /<Box[\s\S]*<Tabs[\s\S]*<\/Tabs>[\s\S]*<\/Box>/.test(categoryNavSource) ||
    !/<Tabs[\s\S]*sx=\{\{[\s\S]*width: '100%'[\s\S]*mb: 3[\s\S]*backgroundColor: 'background.paper'[\s\S]*'& \.MuiTab-root': \{[\s\S]*minHeight: 60/.test(categoryNavSource)
  ) {
    throw new Error('CategoryNav must not keep single-use styled tab or Box layout wrappers; Tabs owns the local sx styling.');
  }
  if (/Typography|label=\{\s*<Box[\s\S]*variant="inherit"/.test(categoryNavSource) || !/label="전체 메뉴"/.test(categoryNavSource) || !/label=\{category\.name\}/.test(categoryNavSource)) {
    throw new Error('CategoryNav must not wrap single-text tab labels in no-op Box/Typography elements; pass label strings directly to Tab.');
  }
  if (/handleCategorySelect/.test(kioskPageSource) || !/onCategorySelect=\{setSelectedCategoryId\}/.test(kioskPageSource)) {
    throw new Error('KioskPage must not wrap setSelectedCategoryId in a no-op category selection handler.');
  }
  if (
    /handleQuantityChange/.test(kioskPageSource) ||
    /setQuantity\(\(currentQuantity\) => Math\.max\(1, currentQuantity \+ 1\)\)/.test(kioskPageSource) ||
    !/setQuantity\(\(currentQuantity\) => Math\.max\(1, currentQuantity - 1\)\)/.test(kioskPageSource) ||
    !/setQuantity\(\(currentQuantity\) => Math\.min\(MAX_ORDER_ITEM_QUANTITY, currentQuantity \+ 1\)\)/.test(kioskPageSource) ||
    !/disabled=\{quantity >= MAX_ORDER_ITEM_QUANTITY\}/.test(kioskPageSource)
  ) {
    throw new Error('KioskPage must not keep a local quantity wrapper and must cap menu-detail quantity increases at the public order limit.');
  }
  if (
    /const handleAddToCart =|handleAddToCart\(|if \(selectedMenu\) \{[\s\S]*?dispatch\(addItem/.test(kioskPageSource) ||
    !/onClick=\{\(\) => \{[\s\S]*dispatch\(addItem\(\{ menu: selectedMenu, quantity \}\)\);[\s\S]*setSelectedMenu\(null\);[\s\S]*setQuantity\(1\);[\s\S]*KioskSoundManager\.playClickSound\(\);[\s\S]*KioskHapticManager\.triggerClick\(\);[\s\S]*\}\}/.test(kioskPageSource)
  ) {
    throw new Error('KioskPage must not keep a single-use add-to-cart wrapper; the selectedMenu branch owns the cart add side effects.');
  }
  if (
    /components\/ui\/Modal|<Modal\b|title=""|maxWidth="sm"|const Modal\s*=/.test(kioskPageSource) ||
    /selectedMenu\?\.name|<DialogContent>\s*\{\s*selectedMenu && \(/.test(kioskPageSource) ||
    /<DialogContent>\s*<Box>\s*<Box\s+component="img"/.test(kioskPageSource) ||
    !/import \{ Close as CloseIcon \} from '@mui\/icons-material';/.test(kioskPageSource) ||
    !/<Dialog[\s\S]*open=\{!!selectedMenu\}[\s\S]*onClose=\{\(\) => setSelectedMenu\(null\)\}[\s\S]*PaperProps=\{\{[\s\S]*borderRadius: 2,[\s\S]*boxShadow: 24/.test(kioskPageSource) ||
    !/<DialogTitle[\s\S]*\{selectedMenu\.name\}[\s\S]*<IconButton onClick=\{\(\) => setSelectedMenu\(null\)\} size="small">[\s\S]*<CloseIcon \/>/.test(kioskPageSource) ||
    !/<Dialog[\s\S]*open=\{!!completedOrder\}[\s\S]*onClose=\{\(\) => setCompletedOrder\(null\)\}[\s\S]*maxWidth="lg"[\s\S]*PaperProps=\{\{[\s\S]*borderRadius: 2,[\s\S]*boxShadow: 24/.test(kioskPageSource)
  ) {
    throw new Error('KioskPage must render its two MUI Dialogs directly without the single-consumer Modal wrapper, no-op title, default maxWidth duplication, duplicate selected-menu guards, or no-op DialogContent body wrappers.');
  }
  if (
    /loading\?:\s*boolean|loading\s*=\s*false/.test(`${menuGridSource}\n${shoppingCartSource}`) ||
    !/loading=\{menusLoading \|\| categoriesLoading\}/.test(kioskPageSource) ||
    !/loading=\{createOrderMutation\.isPending\}/.test(kioskPageSource)
  ) {
    throw new Error('Kiosk page-only components must not keep unreachable loading prop defaults; KioskPage always passes loading explicitly.');
  }
  if (/handleCheckoutClick/.test(shoppingCartSource)) {
    throw new Error('ShoppingCart must not keep a no-op checkout click wrapper around onCheckout.');
  }
  if (
    /const handleCheckout\s*=|onCheckout=\{handleCheckout\}/.test(kioskPageSource) ||
    !/onCheckout=\{async \(\) => \{[\s\S]*const orderItems: CreateOrderItem\[\] = cartItems\.map\(\(item\) => \(\{[\s\S]*menuId: item\.menu\.id,[\s\S]*quantity: item\.quantity[\s\S]*\}\)\);[\s\S]*const result = await createOrderMutation\.mutateAsync\(\{ items: orderItems \}\);[\s\S]*dispatch\(clearCart\(\)\);[\s\S]*KioskSoundManager\.playOrderSuccessSound\(\);[\s\S]*setCompletedOrder\(result\);[\s\S]*KioskSoundManager\.playErrorSound\(\);[\s\S]*setOrderErrorOpen\(true\);[\s\S]*\}\}/.test(kioskPageSource)
  ) {
    throw new Error('KioskPage must not keep a single-use checkout wrapper; ShoppingCart onCheckout owns order creation, cart clearing, completion, and error feedback inline.');
  }
  if (/cartItems\.length === 0[\s\S]*?return;/.test(kioskPageSource) || !/\{items\.length > 0 && \([\s\S]*?onClick=\{onCheckout\}/.test(shoppingCartSource)) {
    throw new Error('KioskPage must not keep an unreachable empty-cart checkout guard; ShoppingCart only renders the checkout button when items.length > 0.');
  }
  if (
    /handleQuantityChange|handleRemoveItem/.test(shoppingCartSource) ||
    !/dispatch\(removeItem\(item\.menu\.id\)\)/.test(shoppingCartSource) ||
    !/dispatch\(updateQuantity\(\{[\s\S]*?menuId:\s*item\.menu\.id,[\s\S]*?quantity:\s*item\.quantity - 1[\s\S]*?\}\)\)/.test(shoppingCartSource) ||
    !/dispatch\(updateQuantity\(\{[\s\S]*?menuId:\s*item\.menu\.id,[\s\S]*?quantity:\s*Math\.min\(MAX_ORDER_ITEM_QUANTITY, item\.quantity \+ 1\)[\s\S]*?\}\)\)/.test(shoppingCartSource) ||
    !/disabled=\{item\.quantity >= MAX_ORDER_ITEM_QUANTITY\}/.test(shoppingCartSource)
  ) {
    throw new Error('ShoppingCart must not keep local wrappers that only dispatch cart quantity/remove actions and must cap quantity increases at the public order limit.');
  }
  if (/size="medium"|variant="filled"/.test(orderReceiptSource)) {
    throw new Error('OrderReceipt must not duplicate MUI Chip size/variant default handling.');
  }
  if (
    /getAudioContext(?:Class)?\(/.test(kioskFeedbackSource) ||
    /window\s+as\s+unknown\s+as\s+typeof\s+AudioContext/.test(kioskFeedbackSource) ||
    !/private static playTone\(frequency: number, duration: number\): void \{[\s\S]*let audioContext = KioskSoundManager\.audioContext;[\s\S]*const AudioContextClass = window\.AudioContext \|\| \(window as Window & \{\s*webkitAudioContext\?: AudioContextConstructor;\s*\}\)\.webkitAudioContext;[\s\S]*audioContext = new AudioContextClass\(\);[\s\S]*KioskSoundManager\.audioContext = audioContext;/.test(kioskFeedbackSource)
  ) {
    throw new Error('KioskSoundManager must inline real AudioContext constructor candidates and cached AudioContext initialization in playTone without single-use helpers.');
  }
  if (frontendDeps.qrcode || frontendDeps['@types/qrcode'] || /qrcode/.test(viteConfigSource) || unsupportedOrderStatusSources.length > 0) {
    throw new Error(`frontend must not ship QR order-status UI without a live public status route: ${unsupportedOrderStatusSources.map(relative).join(', ')}`);
  }
  if (/print-qr|no-print/.test(printUtilsSource)) {
    throw new Error('printUtils.ts must not keep dead print styles for removed QR/status UI or hidden in-page controls.');
  }
  if (unsupportedKioskContractFieldSources.length > 0) {
    throw new Error(`frontend must not carry unsupported kiosk menu/order contract fields: ${unsupportedKioskContractFieldSources.map(relative).join(', ')}`);
  }
  if (/components\/ui\/Card|<MenuCard\b|\bMenuCard\b|\bmenuId:\s*number\b|onSelect:\s*\(\s*menuId:|interactive\??:|elevated\??:|\bhandleClick\b|image=\{imageUrl \|\|/.test(menuGridSource)) {
    throw new Error('MenuGrid must not depend on a single-consumer MenuCard file or keep unused menuId/elevated/interactive props, no-op click wrappers, or duplicate image fallbacks.');
  }
  if (
    /import \{ styled \} from ['"]@mui\/material\/styles['"]|const StyledCard\s*=|motion\(StyledCard\)/.test(menuGridSource) ||
    !/const MotionCard = motion\(MuiCard\);/.test(menuGridSource) ||
    !/sx=\{\(theme: Theme\) => \(\{[\s\S]*borderRadius: theme\.spacing\(2\)[\s\S]*boxShadow: theme\.shadows\[2\][\s\S]*transition: theme\.transitions\.create\(\['box-shadow', 'transform'\]/.test(menuGridSource)
  ) {
    throw new Error('MenuGrid kiosk card rendering must not keep a single-use StyledCard wrapper; motion(MuiCard) owns the card and sx owns the local styles.');
  }
  if (/justifyContent:\s*'space-between'[\s\S]*price\.toLocaleString/.test(menuGridSource)) {
    throw new Error('MenuGrid kiosk card price rendering must not keep a single-child Box layout wrapper.');
  }
  if (
    /const LoadingSkeleton\s*=|const EmptyState\s*=|<LoadingSkeleton\s*\/>|<EmptyState\s*\/>/.test(menuGridSource) ||
    !/Array\.from\(\{ length: 8 \}\)\.map\(\(_, index\) => \([\s\S]*animation: 'pulse 1\.5s ease-in-out infinite'/.test(menuGridSource) ||
    !/menus\.length === 0[\s\S]*메뉴가 없습니다[\s\S]*다른 카테고리를 선택해보세요/.test(menuGridSource)
  ) {
    throw new Error('MenuGrid must inline its single-use loading and empty-state JSX without local wrapper components.');
  }
  if (
    /<MotionCard[\s\S]*initial=\{\{ opacity: 0, y: 20 \}\}|<MotionCard[\s\S]*animate=\{\{ opacity: 1, y: 0 \}\}/.test(menuGridSource) ||
    !/<motion\.div[\s\S]*initial=\{\{ opacity: 0, y: 20 \}\}[\s\S]*animate=\{\{ opacity: 1, y: 0 \}\}[\s\S]*transition=\{\{ duration: 0\.3, delay: index \* 0\.1 \}\}/.test(menuGridSource)
  ) {
    throw new Error('MenuGrid must keep per-card entrance animation on the wrapper and hover/tap interaction on the card itself.');
  }

  console.log('ok frontend public surface');
};

const verifyDocumentationStructure = () => {
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const frontendReadmeSource = fs.readFileSync(path.join(rootDir, 'frontend/README.md'), 'utf8');
  const frontendTestReportSource = fs.readFileSync(path.join(rootDir, 'FRONTEND_TEST_REPORT.md'), 'utf8');
  const apiTestGuideSource = fs.readFileSync(path.join(rootDir, 'API_TEST_GUIDE.md'), 'utf8');
  const requirementsSource = fs.readFileSync(path.join(rootDir, 'REQUIREMENTS.md'), 'utf8');
  const adminAccessSource = fs.readFileSync(path.join(rootDir, 'ADMIN_ACCESS_GUIDE.md'), 'utf8');
  const adminIssueSource = fs.readFileSync(path.join(rootDir, 'ADMIN_ISSUE_RESOLUTION.md'), 'utf8');
  const portChangeSource = fs.readFileSync(path.join(rootDir, 'PORT_CHANGE_GUIDE.md'), 'utf8');
  const completionReportSource = fs.readFileSync(path.join(rootDir, 'COMPLETION_REPORT.md'), 'utf8');
  const projectStatusSource = fs.readFileSync(path.join(rootDir, 'PROJECT_STATUS_SUMMARY.md'), 'utf8');
  const auditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');
  const operationsRunbookSource = fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'));
  const swaggerSource = fs.readFileSync(path.join(rootDir, 'src/config/swagger.config.js'), 'utf8');
  const webAdminRoutesSource = fs.readFileSync(path.join(rootDir, 'src/routes/webAdmin.routes.js'), 'utf8');
  const sidebarSource = fs.readFileSync(path.join(rootDir, 'src/views/partials/sidebar.ejs'), 'utf8');
  const licensePath = path.join(rootDir, 'LICENSE');

  if (/````/.test(readmeSource)) {
    throw new Error('README.md must not contain malformed four-backtick code fences.');
  }
  if (!fs.existsSync(licensePath)) {
    throw new Error('README.md links to LICENSE, so the root LICENSE file must exist.');
  }
  const licenseSource = fs.readFileSync(licensePath, 'utf8');
  const expectedPackageDescription = 'All-In-One Smart Kiosk - full-stack kiosk ordering and admin operations system';
  if (
    packageJson.description !== expectedPackageDescription ||
    /MVP backend API system|100%\s*(?:완성|기능 완성|프로덕션 레디|production ready)|즉시 운영 가능|상용 서비스 가능|완성된 프로덕션 레디 시스템/.test(packageJson.description || '')
  ) {
    throw new Error('package.json description must match the current full-stack scope without unsupported production readiness claims.');
  }
  if (packageJson.license !== 'ISC' || !/license-ISC/.test(readmeSource) || !/ISC License/.test(licenseSource)) {
    throw new Error('Package metadata, README badge, and LICENSE file must agree on the ISC license.');
  }
  if (/name:\s*'MIT'/.test(swaggerSource) || /opensource\.org\/licenses\/MIT/.test(swaggerSource) || !/name:\s*'ISC'/.test(swaggerSource) || !/opensource\.org\/licenses\/ISC/.test(swaggerSource)) {
    throw new Error('Swagger API metadata license must match package.json ISC license.');
  }
  if (
    packageJson.engines?.node !== '>=20.0.0' ||
    packageLock.packages?.['']?.engines?.node !== '>=20.0.0' ||
    !/node-%3E%3D20\.0\.0/.test(readmeSource) ||
    !/\*\*Node\.js\*\*: 20\.0\.0 이상/.test(readmeSource) ||
    /node-%3E%3D18\.0\.0|\*\*Node\.js\*\*: 18\.0\.0 이상/.test(readmeSource)
  ) {
    throw new Error('package metadata and README must advertise the Node.js 20 runtime baseline used by Docker and CI.');
  }
  ['docs', 'setup'].forEach((scriptName) => {
    if (Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, scriptName)) {
      throw new Error(`package.json must not keep undocumented scaffold script "${scriptName}".`);
    }
  });
  if (/src\/controllers\/order\.controller|frontend\/src\/hooks\/useAdminApi|frontend\/src\/hooks\/usePublicApi|frontend\/src\/services\/adminApi|frontend\/src\/components\/kiosk\/ContactInput|frontend\/src\/components\/kiosk\/OrderCompletionFlow|frontend\/src\/services\/notificationService/.test(readmeSource)) {
    throw new Error('README.md must not reference pruned runtime files in its live project structure.');
  }
  const readmeStructureBlock = (readmeSource.match(/## 📁 프로젝트 구조[\s\S]*?```([\s\S]*?)```/) || [])[1];
  if (!readmeStructureBlock) {
    throw new Error('README.md must keep a fenced project structure block.');
  }
  if (/FRONTEND_DEVELOPMENT_PLAN|QUICK_TEST_GUIDE|TROUBLESHOOTING_ORDER|api_documentation_index/.test(readmeStructureBlock)) {
    throw new Error('README.md project structure must not list pruned support documents.');
  }
  const liveOperationalDocs = [
    ['README.md', readmeSource],
    ['frontend/README.md', frontendReadmeSource],
    ['API_TEST_GUIDE.md', apiTestGuideSource],
    ['REQUIREMENTS.md', requirementsSource],
    ['ADMIN_ACCESS_GUIDE.md', adminAccessSource],
    ['ADMIN_ISSUE_RESOLUTION.md', adminIssueSource],
    ['OPERATIONS_RUNBOOK.md', operationsRunbookSource],
    ['PORT_CHANGE_GUIDE.md', portChangeSource]
  ];
  const prunedArtifactPattern = /FRONTEND_DEVELOPMENT_PLAN|QUICK_TEST_GUIDE|TROUBLESHOOTING_ORDER|api_documentation_index|test_order_management|test_statistics_dashboard|test_upload|frontend\/test-frontend|frontend\/test-order-flow|ContactInput|OrderCompletionFlow|OrderQRCode|components\/ui\/Card|Card\.tsx|components\/ui\/Modal|Modal\.tsx|useAdminApi|usePublicApi|adminApi|notificationService|authSlice|orderSlice|vite\.svg|react\.svg|App\.css|frontend\/\.env\.development|cookies\.txt|uploads\/menus\/README/;
  const staleOperationalDocs = liveOperationalDocs
    .filter(([, source]) => prunedArtifactPattern.test(source))
    .map(([fileName]) => fileName);
  if (staleOperationalDocs.length > 0) {
    throw new Error(`Live operational docs must not reference pruned support/runtime artifacts: ${staleOperationalDocs.join(', ')}`);
  }
  const publicOrderBoundsDocs = [
    ['README.md', readmeSource],
    ['API_TEST_GUIDE.md', apiTestGuideSource],
    ['REQUIREMENTS.md', requirementsSource]
  ];
  const docsMissingPublicOrderBounds = publicOrderBoundsDocs
    .filter(([, source]) => (
      !/공개 주문 생성 요청[\s\S]{0,160}`items` 1-100개/.test(source) ||
      !/`menuId` 1 이상 정수/.test(source) ||
      !/`quantity` 1-99 정수/.test(source)
    ))
    .map(([fileName]) => fileName);
  if (docsMissingPublicOrderBounds.length > 0) {
    throw new Error(`Public order docs must document items 1-100, menuId positive integer, and quantity 1-99 bounds: ${docsMissingPublicOrderBounds.join(', ')}`);
  }
  const refreshedGuideHeaders = [
    ['API_TEST_GUIDE.md', apiTestGuideSource],
    ['REQUIREMENTS.md', requirementsSource],
    ['ADMIN_ACCESS_GUIDE.md', adminAccessSource],
    ['ADMIN_ISSUE_RESOLUTION.md', adminIssueSource],
    ['PORT_CHANGE_GUIDE.md', portChangeSource]
  ];
  const staleGuideHeaders = refreshedGuideHeaders
    .filter(([, source]) => /^> 업데이트: 2026-05-29$/m.test(source) || !/^> 업데이트: 2026-05-30$/m.test(source))
    .map(([fileName]) => fileName);
  if (staleGuideHeaders.length > 0) {
    throw new Error(`Refreshed support guides must show the latest 2026-05-30 update date: ${staleGuideHeaders.join(', ')}`);
  }
  const requiredReadmeStructureDocs = [
    'REQUIREMENTS.md',
    'API_TEST_GUIDE.md',
    'OPERATIONS_RUNBOOK.md',
    'ADMIN_ACCESS_GUIDE.md',
    'ADMIN_ISSUE_RESOLUTION.md',
    'PORT_CHANGE_GUIDE.md',
    'COMPLETION_REPORT.md',
    'PROJECT_STATUS_SUMMARY.md',
    'PROJECT_COMPLETENESS_AUDIT.md',
    'FRONTEND_TEST_REPORT.md'
  ];
  requiredReadmeStructureDocs.forEach((documentName) => {
    const documentPath = path.join(rootDir, documentName);
    if (!fs.existsSync(documentPath)) {
      throw new Error(`README.md project structure requires missing root support document ${documentName}.`);
    }
    if (!readmeStructureBlock.includes(documentName)) {
      throw new Error(`README.md project structure must list root support document ${documentName}.`);
    }
  });
  [
    {
      path: '/admin',
      description: '매출/주문/최근 주문/키오스크 상태 요약',
      routePattern: /router\.get\('\/', webAdminController\.getDashboard\)/,
      sidebarPattern: /href="\/admin"/
    },
    {
      path: '/admin/orders',
      description: '주문 목록과 상태 변경',
      routePattern: /router\.get\('\/orders', webAdminController\.getOrders\)/,
      sidebarPattern: /href="\/admin\/orders"/
    },
    {
      path: '/admin/menus',
      description: '메뉴 CRUD',
      routePattern: /router\.get\('\/menus', webAdminController\.getMenus\)/,
      sidebarPattern: /href="\/admin\/menus"/
    },
    {
      path: '/admin/categories',
      description: '카테고리 CRUD',
      routePattern: /router\.get\('\/categories', webAdminController\.getCategories\)/,
      sidebarPattern: /href="\/admin\/categories"/
    },
    {
      path: '/admin/statistics',
      description: '통계와 리포트 화면',
      routePattern: /router\.get\('\/statistics', webAdminController\.getStatistics\)/,
      sidebarPattern: /href="\/admin\/statistics"/
    }
  ].forEach(({ path: adminPath, description, routePattern, sidebarPattern }) => {
    const docLine = `- \`${adminPath}\`: ${description}`;
    if (!routePattern.test(webAdminRoutesSource)) {
      throw new Error(`webAdmin.routes.js must expose ${adminPath}.`);
    }
    if (!sidebarPattern.test(sidebarSource)) {
      throw new Error(`admin sidebar must link to ${adminPath}.`);
    }
    if (!readmeSource.includes(docLine) || !operationsRunbookSource.includes(docLine)) {
      throw new Error(`README.md and OPERATIONS_RUNBOOK.md must document EJS admin screen ${adminPath}.`);
    }
  });
  [
    'admin.controller.js',
    'category.controller.js',
    'menu.controller.js',
    'kioskStatus.controller.js',
    'csrf.middleware.js',
    'flash.middleware.js',
    'rateLimit.middleware.js',
    'admin.routes.js',
    'category.routes.js',
    'menu.routes.js',
    'mysqlSessionStore.js'
  ].forEach((fileName) => {
    if (!readmeStructureBlock.includes(fileName)) {
      throw new Error(`README.md project structure must include current runtime file ${fileName}.`);
    }
  });
  if (/실제 DB 연동 검증[^\n]+E2E 확인 필요/.test(readmeSource)) {
    throw new Error('README.md must not describe implemented MySQL E2E coverage as still needed.');
  }
  if (
    /Q --> AD/.test(readmeSource) ||
    !/A --> RT/.test(readmeSource) ||
    !/Q --> P/.test(readmeSource) ||
    /API Hooks/.test(readmeSource) ||
    !/F --> G\[publicApi Service\]/.test(readmeSource) ||
    !/G --> H\[Public API\]/.test(readmeSource)
  ) {
    throw new Error('README.md architecture graph must show React Query calling publicApi service/public API only; React no longer has API hook wrappers or Admin API calls.');
  }
  if (
    /mysql -u your_username -p your_database < database_schema\.sql/.test(readmeSource) ||
    /mysql -u <user> -p(?: <database>| kiosk_db)? < database_schema\.sql/.test(`${apiTestGuideSource}\n${adminAccessSource}\n${adminIssueSource}\n${operationsRunbookSource}`)
  ) {
    throw new Error('Setup docs must use db:apply-schema instead of direct mysql schema apply examples.');
  }
  if (
    /\/admin\/login`과 `\/admin\/logout`은 인증 없이 접근 가능하다/.test(adminAccessSource) ||
    !/`\/admin\/login`만 인증 없이 접근 가능하다/.test(adminAccessSource) ||
    !/`\/admin\/logout`과 그 외 `\/admin` 하위 화면은 `req\.session\.admin`이 있어야 접근 가능하다/.test(adminAccessSource) ||
    !/`\/admin\/logout`은 CSRF 토큰을 포함한 POST form으로만 제공된다/.test(adminAccessSource)
  ) {
    throw new Error('ADMIN_ACCESS_GUIDE.md must describe /admin/logout as an authenticated CSRF-protected POST route.');
  }
  if (
    /\/admin\/login`과 `\/admin\/logout`을 인증 예외로/.test(adminIssueSource) ||
    !/`\/admin\/login`만 인증 예외로/.test(adminIssueSource) ||
    !/`\/admin\/logout`과 나머지 관리자 화면은 `requireAuth` 뒤에 두었다/.test(adminIssueSource) ||
    !/`\/admin\/logout`은 CSRF 토큰을 포함한 POST form으로만 호출된다/.test(adminIssueSource)
  ) {
    throw new Error('ADMIN_ISSUE_RESOLUTION.md must describe /admin/logout as an authenticated CSRF-protected POST route.');
  }
  if (
    !/CONFIRM_SCHEMA_APPLY=kiosk_db npm run db:apply-schema/.test(readmeSource) ||
    !/SCHEMA_ENV_FILE=\.env\.production CONFIRM_SCHEMA_APPLY=kiosk_db npm run db:apply-schema/.test(readmeSource) ||
    !/CONFIRM_SCHEMA_APPLY=kiosk_db npm run db:apply-schema/.test(apiTestGuideSource) ||
    !/CONFIRM_SCHEMA_APPLY=kiosk_db npm run db:apply-schema/.test(adminAccessSource) ||
    !/CONFIRM_SCHEMA_APPLY=kiosk_db npm run db:apply-schema/.test(adminIssueSource) ||
    !/CONFIRM_SCHEMA_APPLY=kiosk_db npm run db:apply-schema/.test(operationsRunbookSource) ||
    !/CREATE DATABASE IF NOT EXISTS kiosk_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci/.test(readmeSource) ||
    !/CREATE DATABASE IF NOT EXISTS kiosk_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci/.test(apiTestGuideSource) ||
    !/CREATE DATABASE IF NOT EXISTS kiosk_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci/.test(adminAccessSource) ||
    !/CREATE DATABASE IF NOT EXISTS kiosk_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci/.test(adminIssueSource) ||
    !/CREATE DATABASE IF NOT EXISTS kiosk_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci/.test(operationsRunbookSource) ||
    !/`db:apply-schema`는 database를 생성하지 않으므로 `DB_NAME`에 해당하는 database를 먼저 만든다/.test(apiTestGuideSource) ||
    !/`DB_NAME`이 `kiosk_db`가 아니면 생성할 database 이름과 `CONFIRM_SCHEMA_APPLY` 값을 실제 DB 이름에 맞춘다/.test(apiTestGuideSource) ||
    !/`DB_NAME`이 `kiosk_db`가 아니면 생성할 database 이름과 `CONFIRM_SCHEMA_APPLY` 값을 실제 DB 이름에 맞춘다/.test(adminAccessSource) ||
    !/`DB_NAME`이 `kiosk_db`가 아니면 생성할 database 이름과 `CONFIRM_SCHEMA_APPLY` 값을 실제 DB 이름에 맞춘다/.test(adminIssueSource)
  ) {
    throw new Error('Setup docs must document guarded schema apply via npm run db:apply-schema.');
  }
  if (!/`npm run test:e2e`와 `npm run test:e2e:browser`/.test(readmeSource)) {
    throw new Error('README.md frontend status must mention current MySQL API and browser E2E coverage.');
  }
  if (!/npm run deps:check/.test(`${readmeSource}\n${operationsRunbookSource}`) || !/bootstrap`, `bootstrap-icons`, `chart\.js`/.test(`${readmeSource}\n${operationsRunbookSource}`)) {
    throw new Error('README or runbook must document dependency prune checking and the intentional admin browser vendor asset depcheck ignore list.');
  }
  const npmTestStaticVerificationSources = [
    readmeSource,
    apiTestGuideSource,
    requirementsSource,
    completionReportSource,
    projectStatusSource,
    auditSource
  ];
  if (
    npmTestStaticVerificationSources.some(source => (
      /루트 `npm test`[^\n]*(?:JS 문법|JavaScript 문법|JS 문법\/EJS|EJS 템플릿 컴파일)[^\n]*(?:만|검증합니다|실행한다|교체했다|연결했다)/.test(source)
    )) ||
    npmTestStaticVerificationSources.some(source => (
      !/`scripts\/verify-static\.js`[^\n]*JavaScript\/EJS 기본 검사[^\n]*문서\/라우트\/OpenAPI\/운영 계약 정적 검증/.test(source)
    ))
  ) {
    throw new Error('Docs must describe npm test as the full scripts/verify-static.js static contract suite, not only JS/EJS syntax checks.');
  }
  if (
    !/미지원 `\.env\.example`\/`\.env\.production\.example` placeholder 키를 제거했다/.test(completionReportSource) ||
    !/미지원 `\.env\.example`\/`\.env\.production\.example` placeholder 키를 제거했다/.test(projectStatusSource) ||
    !/미지원 `\.env\.example`\/`\.env\.production\.example` 키 금지/.test(projectStatusSource) ||
    !/미지원 `\.env\.example`\/`\.env\.production\.example` 키 재유입 금지/.test(auditSource)
  ) {
    throw new Error('Status docs must describe unsupported env key pruning and static guards across both env example files.');
  }
  const refreshedReportHeaders = [
    ['COMPLETION_REPORT.md', completionReportSource],
    ['PROJECT_STATUS_SUMMARY.md', projectStatusSource],
    ['PROJECT_COMPLETENESS_AUDIT.md', auditSource]
  ];
  const staleSingleDateReports = refreshedReportHeaders
    .filter(([, source]) => (
      /^> (작성일|업데이트): 2026-05-29$/m.test(source) ||
      !/^> 최초 작성: 2026-05-29$/m.test(source) ||
      !/^> 최근 갱신: 2026-05-30$/m.test(source)
    ))
    .map(([docPath]) => docPath);
  if (staleSingleDateReports.length > 0) {
    throw new Error(`Refreshed reports must separate original write date from latest update date: ${staleSingleDateReports.join(', ')}`);
  }
  if (
    !/^> 최초 작성: 2026-05-28$/m.test(operationsRunbookSource) ||
    !/^> 최근 갱신: 2026-05-30$/m.test(operationsRunbookSource) ||
    /^> 작성일: 2026-05-28$/m.test(operationsRunbookSource)
  ) {
    throw new Error('OPERATIONS_RUNBOOK.md must separate original write date from latest update date.');
  }
  if (
    !/repository variable `FRONTEND_KIOSK_STATUS_TOKEN`/.test(frontendReadmeSource) ||
    !/matching `VITE_KIOSK_STATUS_TOKEN`/.test(frontendReadmeSource) ||
    !/VITE_API_URL=http:\/\/localhost:3000 VITE_ALLOW_LOCAL_API_URL=true VITE_USE_MOCK_DATA=false npm run build/.test(frontendReadmeSource) ||
    !/## 운영 증거/.test(frontendReadmeSource) ||
    !/실제 운영 URL에서 배포 후 smoke와 장시간 heartbeat soak 기록 확보 필요/.test(frontendReadmeSource) ||
    /실제 운영 URL에서 배포 후 smoke와 장시간 heartbeat soak 기록 확보\s*$/m.test(frontendReadmeSource) ||
    /## 남은 작업/.test(frontendReadmeSource)
  ) {
    throw new Error('frontend/README.md must distinguish release variable FRONTEND_KIOSK_STATUS_TOKEN, document the current build guard command, and describe production smoke/soak as required evidence, not already-acquired evidence.');
  }
  if (!/CSRF 기반 EJS session login\/logout/.test(readmeSource) || !/CSRF 기반 EJS session login\/logout/.test(operationsRunbookSource)) {
    throw new Error('deployment smoke docs must describe CSRF-based EJS session login/logout coverage.');
  }
  if (/npx --yes depcheck --json/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the pinned npm run deps:check command instead of the stale raw depcheck invocation.');
  }
  if (
    !/`npm run deps:check`: 통과/.test(frontendTestReportSource) ||
    !/VITE_API_URL=http:\/\/localhost:3000 VITE_ALLOW_LOCAL_API_URL=true VITE_USE_MOCK_DATA=false npm run build/.test(frontendTestReportSource) ||
    !/VITE_API_URL=https:\/\/api\.example\.com VITE_USE_MOCK_DATA=false npm run build/.test(frontendTestReportSource)
  ) {
    throw new Error('FRONTEND_TEST_REPORT.md must include the current dependency prune check and both frontend build guard commands.');
  }
  if (
    !/최근 부분 재검증일/.test(frontendTestReportSource) ||
    !/기존 전체 브라우저 E2E 기록: `npm run test:e2e:browser` 통과/.test(frontendTestReportSource) ||
    !/브라우저 E2E는 이번 부분 재검증 범위에서 제외/.test(frontendTestReportSource) ||
    !/2026-05-30 부분 재검증 기준/.test(frontendReadmeSource) ||
    !/브라우저 E2E의 전체 통과 기록/.test(frontendReadmeSource) ||
    !/브라우저 E2E는 이 2026-05-30 부분 재검증 범위에서 제외/.test(auditSource)
  ) {
    throw new Error('Frontend verification docs must distinguish the latest partial rerun from the retained browser E2E full-run record.');
  }
  if (/ts-prune`이 표시한/.test(auditSource) || !/npx --yes ts-prune`은 출력 없이 종료/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the current clean frontend ts-prune result instead of stale export candidates.');
  }
  if (!/run:\s*npm run deps:check/.test(fs.readFileSync(path.join(rootDir, '.github/workflows/ci.yml'), 'utf8')) || !/run:\s*npm run deps:check/.test(fs.readFileSync(path.join(rootDir, '.github/workflows/release.yml'), 'utf8'))) {
    throw new Error('CI and release workflows must run the dependency prune check.');
  }
  const staleReadmePatterns = [
    /배포 후 smoke 검증 골격/,
    /원격 배포\/백업 보관 자동화 보강/,
    /운영 전 검증 필요/,
    /MVP 골격 구현 완료/,
    /GitHub Environment 보호 규칙, secret manager/,
    /향후 계획 \(v1\.1\+\)/,
    /Redis 캐싱 시스템/,
    /다국어 지원 \(i18n\)/,
    /푸시 알림 시스템/
  ];
  const staleReadmePattern = staleReadmePatterns.find(pattern => pattern.test(readmeSource));
  if (staleReadmePattern) {
    throw new Error(`README.md contains stale project status wording: ${staleReadmePattern}`);
  }
  if (!/### 🔎 \*\*다음 완료 기준\*\*/.test(readmeSource) || !/운영 URL에서 `npm run ops:smoke`와 `npm run ops:heartbeat-soak` 실행 기록 확보/.test(readmeSource)) {
    throw new Error('README.md roadmap must use evidence-backed completion criteria instead of unsupported generic future features.');
  }
  if (!/실제 `\.env\.production` materialization/.test(readmeSource) || !/GitHub Actions deploy secrets/.test(readmeSource) || !/repository variable `FRONTEND_API_URL`/.test(readmeSource) || !/FRONTEND_KIOSK_STATUS_TOKEN/.test(readmeSource)) {
    throw new Error('README.md must identify the remaining production env, external deploy secret, frontend URL, and optional heartbeat token evidence gaps.');
  }
  if (/Role-based Access/.test(readmeSource) || /Add some AmazingFeature/.test(readmeSource)) {
    throw new Error('README.md must not claim unsupported RBAC or keep template contribution placeholders.');
  }
  if (/GET\/POST\/PUT\/DELETE \/api\/(?:menus|categories)/.test(requirementsSource)) {
    throw new Error('REQUIREMENTS.md must not collapse item-level admin menu/category routes into root CRUD paths.');
  }
  [
    'GET /api/menus',
    'POST /api/menus',
    'GET /api/menus/:id',
    'PUT /api/menus/:id',
    'DELETE /api/menus/:id',
    'POST /api/menus/:menuId/image',
    'GET /api/categories',
    'POST /api/categories',
    'GET /api/categories/:id',
    'PUT /api/categories/:id',
    'DELETE /api/categories/:id'
  ].forEach((endpoint) => {
    if (!requirementsSource.includes(endpoint)) {
      throw new Error(`REQUIREMENTS.md admin API requirements must document ${endpoint}.`);
    }
  });
  if ((readmeSource.match(/### 📋 \*\*기여 방법\*\*/g) || []).length !== 1) {
    throw new Error('README.md must contain one contribution steps heading.');
  }
  if (/JSDoc 주석으로 함수 문서화|RESTful API 설계 원칙|새로운 기능 추가 시 테스트 케이스 작성/.test(readmeSource)) {
    throw new Error('README.md contribution guide must not keep generic template quality gates that are not enforced by this repository.');
  }
  if (
    !/기본 검증: `npm test`, `npm run deps:check`/.test(readmeSource) ||
    !/frontend 변경: `cd frontend && npm run lint`, `cd frontend && VITE_API_URL=http:\/\/localhost:3000 VITE_ALLOW_LOCAL_API_URL=true VITE_USE_MOCK_DATA=false npm run build`/.test(readmeSource) ||
    !/DB\/API\/Admin 흐름 변경: `npm run test:e2e`/.test(readmeSource) ||
    !/React\/EJS 브라우저 흐름 변경: `npm run test:e2e:browser`/.test(readmeSource) ||
    !/운영 shell\/deploy 변경: `npm run db:backup:check`/.test(readmeSource)
  ) {
    throw new Error('README.md contribution guide must document the current repository verification commands.');
  }
  if (
    !/cd frontend && npm ci/.test(operationsRunbookSource) ||
    !/cd frontend && npm run lint/.test(operationsRunbookSource) ||
    !/cd frontend && VITE_API_URL=http:\/\/localhost:3000 VITE_ALLOW_LOCAL_API_URL=true VITE_USE_MOCK_DATA=false npm run build/.test(operationsRunbookSource) ||
    !/cd frontend && npm audit --audit-level=moderate/.test(operationsRunbookSource) ||
    /\ncd frontend\nnpm ci\nnpm run lint/.test(operationsRunbookSource)
  ) {
    throw new Error('OPERATIONS_RUNBOOK.md deployment gate must run frontend verification commands with explicit cd frontend && prefixes.');
  }

  const staleRequirementPatterns = [
    /브라우저 기반 실제 백엔드 연동 E2E는 아직 필요하다/,
    /실제 브라우저 자동화 E2E는 아직 필요하다/,
    /브라우저 E2E로 화면 주기 전송과 대시보드 표시를 검증하는 작업은 남아 있다/,
    /GitHub Environment 보호 규칙,[^\n]+운영은 없다/
  ];
  const staleRequirementPattern = staleRequirementPatterns.find(pattern => pattern.test(requirementsSource));
  if (staleRequirementPattern) {
    throw new Error(`REQUIREMENTS.md contains stale completion gap wording: ${staleRequirementPattern}`);
  }
  if (!/`npm run test:e2e:browser`/.test(requirementsSource)) {
    throw new Error('REQUIREMENTS.md must document the current browser E2E verification path.');
  }
  if (
    !/`Admins`, `Categories`, `Menus`, `Orders`, `OrderItems`, `KioskStatuses`, `Sessions` 테이블을 생성한다/.test(requirementsSource) ||
    !/운영 EJS 관리자 세션은 `SESSION_STORE=mysql`에서 `Sessions` 테이블에 저장해야 한다/.test(requirementsSource)
  ) {
    throw new Error('REQUIREMENTS.md must include the Sessions table and MySQL-backed admin session storage requirement.');
  }
  if (!/`npm run ops:heartbeat-soak`/.test(requirementsSource) || !/실제 `\.env\.production` materialization/.test(requirementsSource) || !/`FRONTEND_API_URL`/.test(requirementsSource) || !/FRONTEND_KIOSK_STATUS_TOKEN/.test(requirementsSource)) {
    throw new Error('REQUIREMENTS.md must separate implemented verification from environment-specific production gaps, including production env materialization and optional heartbeat release variables.');
  }
  if (
    !/실제 `\.env\.production`과 필요한 secret file[\s\S]*`npm run ops:preflight` 통과 기록/.test(requirementsSource) ||
    !/`GITHUB_ENVIRONMENT=production npm run ops:github-env:check`와 `GITHUB_ENVIRONMENT=production npm run ops:github-actions:check`가 통과/.test(requirementsSource) ||
    !/`DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_PRIVATE_KEY`, repository variable `FRONTEND_API_URL`/.test(requirementsSource) ||
    !/실제 secret manager provider\/credential, 외부 alert receiver\/credential, object storage provider CLI\/credential/.test(requirementsSource) ||
    !/실제 운영 URL에서 `npm run ops:smoke`와 `npm run ops:heartbeat-soak` 실행 기록/.test(requirementsSource)
  ) {
    throw new Error('REQUIREMENTS.md completion criteria must require production preflight, GitHub gate/secrets audit, external secret/alert/backup credentials, and operating URL smoke/soak evidence.');
  }
  if (/주문 완료[^.\n]*QR|영수증\/QR|@types\/qrcode.*devDependencies|@types\/qrcode.*개발 의존성/.test(`${requirementsSource}\n${frontendReadmeSource}\n${completionReportSource}`)) {
    throw new Error('Docs must not describe the removed QR order-status UI or qrcode dependency as live functionality.');
  }
  if (/express-flash/.test(`${readmeSource}\n${requirementsSource}\n${frontendReadmeSource}\n${completionReportSource}\n${projectStatusSource}\n${auditSource}\n${operationsRunbookSource}`)) {
    throw new Error('Docs must not refer to express-flash; the pruned admin flash dependency was connect-flash.');
  }
  if (/## 현재 미완료\/리스크/.test(completionReportSource) || !/## 현재 상태와 남은 운영 리스크/.test(completionReportSource)) {
    throw new Error('COMPLETION_REPORT.md must separate implemented status from remaining environment-specific operational risk.');
  }
  if (!/backend\/browser runtime `console\.\*` 금지/.test(operationsRunbookSource) || !/중복 `console\.warn`\/`console\.error` side effect/.test(`${completionReportSource}\n${projectStatusSource}`)) {
    throw new Error('Operational docs must describe the current backend/browser runtime console guard.');
  }

  if (/## 아직 완료가 아닌 항목/.test(adminIssueSource)) {
    throw new Error('ADMIN_ISSUE_RESOLUTION.md must not label implemented verification paths as unfinished work.');
  }
  if (!/## 검증 상태와 남은 운영 작업/.test(adminIssueSource) || !/`npm run ops:smoke`와 `npm run ops:heartbeat-soak`/.test(adminIssueSource)) {
    throw new Error('ADMIN_ISSUE_RESOLUTION.md must distinguish current verification from production smoke/soak evidence gaps.');
  }

  const requiredApiGuidePatterns = [
    [/http:\/\/localhost:3000\/api\/categories\b/, 'admin category list'],
    [/POST http:\/\/localhost:3000\/api\/categories/, 'admin category create'],
    [/curl http:\/\/localhost:3000\/api\/categories\/\$CATEGORY_ID\s*\\\s*\n\s*-H "Authorization: Bearer \$TOKEN"/, 'admin category detail'],
    [/PUT http:\/\/localhost:3000\/api\/categories\/\$CATEGORY_ID/, 'admin category update'],
    [/DELETE http:\/\/localhost:3000\/api\/categories\/\$CATEGORY_ID/, 'admin category delete'],
    [/http:\/\/localhost:3000\/api\/menus\?category_id=\$CATEGORY_ID&status=FOR_SALE/, 'admin menu list filters'],
    [/POST http:\/\/localhost:3000\/api\/menus/, 'admin menu create'],
    [/curl http:\/\/localhost:3000\/api\/menus\/\$MENU_ID\s*\\\s*\n\s*-H "Authorization: Bearer \$TOKEN"/, 'admin menu detail'],
    [/PUT http:\/\/localhost:3000\/api\/menus\/\$MENU_ID/, 'admin menu update'],
    [/DELETE http:\/\/localhost:3000\/api\/menus\/\$MENU_ID/, 'admin menu delete'],
    [/api\/admin\/statistics\?startDate=\$START_DATE&endDate=\$END_DATE/, 'admin statistics dashboard'],
    [/api\/admin\/statistics\/sales\?startDate=\$START_DATE&endDate=\$END_DATE/, 'admin sales statistics'],
    [/api\/admin\/statistics\/top-menus\?limit=10/, 'admin top menus statistics'],
    [/api\/admin\/statistics\/daily-sales/, 'admin daily sales statistics'],
    [/api\/admin\/statistics\/hourly-analysis/, 'admin hourly statistics'],
    [/api\/admin\/statistics\/category-analysis/, 'admin category statistics'],
    [/api\/admin\/statistics\/report\?format=csv/, 'admin statistics CSV report']
  ];
  requiredApiGuidePatterns.forEach(([pattern, label]) => {
    if (!pattern.test(apiTestGuideSource)) {
      throw new Error(`API_TEST_GUIDE.md must document ${label} curl coverage.`);
    }
  });

  const completionDocsSource = [
    readmeSource,
    requirementsSource,
    completionReportSource,
    projectStatusSource,
    auditSource
  ].join('\n');
  const overstatedCompletionLine = completionDocsSource
    .split(/\r?\n/)
    .find(line => (
      /100%\s*(?:완성|기능 완성|프로덕션 레디|production ready)|즉시 운영 가능|상용 서비스 가능|완성된 프로덕션 레디 시스템/.test(line) &&
      !/아니다|아니라|확인되지 않는다/.test(line)
    ));
  if (overstatedCompletionLine) {
    throw new Error('Completion documents must not claim 100% production readiness while external production evidence is missing.');
  }
  if (!/OpenAPI live path coverage/.test(completionReportSource) || !/live path coverage/.test(auditSource)) {
    throw new Error('Completion reports must document current OpenAPI live path coverage.');
  }
  if (!/CSRF 기반 EJS session login\/logout/.test(completionReportSource) || !/CSRF 기반 EJS session login\/logout/.test(projectStatusSource)) {
    throw new Error('Completion/status reports must document CSRF-based deployment smoke admin session coverage.');
  }
  if (
    !/JWT_SECRET_FILE`\/`SESSION_SECRET_FILE`\/`KIOSK_STATUS_TOKEN_FILE`\/`METRICS_TOKEN_FILE/.test(completionReportSource) ||
    !/JWT_SECRET_FILE`\/`SESSION_SECRET_FILE`\/`KIOSK_STATUS_TOKEN_FILE`\/`METRICS_TOKEN_FILE/.test(projectStatusSource) ||
    !/AIOSK_SECRETS_DIR/.test(completionReportSource) ||
    !/AIOSK_SECRETS_DIR/.test(projectStatusSource)
  ) {
    throw new Error('Completion/status reports must document full app secret file and AIOSK_SECRETS_DIR preflight coverage.');
  }
  if (!/실제 `\.env\.production` materialization/.test(`${completionReportSource}\n${projectStatusSource}`) || !/ops:github-actions:check/.test(completionReportSource) || !/DEPLOY_SSH_HOST/.test(completionReportSource) || !/FRONTEND_API_URL/.test(projectStatusSource) || !/FRONTEND_KIOSK_STATUS_TOKEN/.test(`${completionReportSource}\n${projectStatusSource}`)) {
    throw new Error('Completion/status reports must document the current production env, GitHub deploy secret, frontend URL, and optional heartbeat token gaps.');
  }
  const githubAuditDocsSource = [
    readmeSource,
    operationsRunbookSource,
    completionReportSource,
    projectStatusSource,
    auditSource
  ].join('\n');
  if (/2026-05-29 (?:현재|재실행 기준)|2026-05-29 기준|2026-05-29 재실행/.test(githubAuditDocsSource)) {
    throw new Error('GitHub external audit evidence must not keep stale 2026-05-29 recency wording.');
  }
  if (
    !/2026-05-30 재실행 기준[\s\S]*ops:github-env:check[\s\S]*통과/.test(githubAuditDocsSource) ||
    !/2026-05-30 재실행 기준[\s\S]*ops:github-actions:check[\s\S]*(?:실패|누락)/.test(githubAuditDocsSource) ||
    !/DEPLOY_SSH_HOST/.test(githubAuditDocsSource) ||
    !/FRONTEND_API_URL/.test(githubAuditDocsSource)
  ) {
    throw new Error('Docs must record the 2026-05-30 GitHub Environment pass and Actions secret/variable gap evidence.');
  }
  if (!/(?:systemd timer 예시[^\n]*\/opt\/aiosk\/\.env\.production|\/opt\/aiosk\/\.env\.production[^\n]*systemd timer 예시)/.test(`${completionReportSource}\n${projectStatusSource}\n${requirementsSource}`)) {
    throw new Error('Completion/status/requirements reports must document that the systemd backup timer uses /opt/aiosk/.env.production.');
  }
  if (/Generated an empty chunk: "react"|AdminUtils`가 외부 소비 없이 `public\/js\/admin\.js` 내부/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must not keep stale verification claims for the removed React manual chunk or AdminUtils helper.');
  }

  console.log('ok documentation structure');
};

const verifyProductionRuntimeConfigGuard = () => {
  const serverSource = fs.readFileSync(path.join(rootDir, 'src/server.js'), 'utf8');
  const dbSource = fs.readFileSync(path.join(rootDir, 'src/models/db.js'), 'utf8');
  const auditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');
  const baseEnv = {
    ...process.env,
    NODE_ENV: 'production',
    DB_HOST: '127.0.0.1',
    DB_USER: 'root',
    DB_PASSWORD: 'root',
    DB_NAME: 'aiosk_static_verify',
    SESSION_SECRET: 'valid-session-secret-at-least-32-characters',
    METRICS_TOKEN: 'valid-metrics-token-at-least-32-characters',
    CORS_ORIGIN: 'https://kiosk.example.com',
    SOCKET_CORS_ORIGIN: 'https://admin.example.com'
  };
  if (
    /const parseBoolean\s*=|parseBoolean\(/.test(serverSource) ||
    !/const sessionCookieSecureEnv = process\.env\.SESSION_COOKIE_SECURE;[\s\S]*let sessionCookieSecure = isProduction;[\s\S]*const normalizedSessionCookieSecure = String\(sessionCookieSecureEnv\)\.toLowerCase\(\);[\s\S]*\['1', 'true', 'yes', 'on'\]\.includes\(normalizedSessionCookieSecure\)[\s\S]*\['0', 'false', 'no', 'off'\]\.includes\(normalizedSessionCookieSecure\)[\s\S]*throw new Error\(`Invalid boolean environment value: \$\{sessionCookieSecureEnv\}`\);/.test(serverSource) ||
    !/secure:\s*sessionCookieSecure/.test(serverSource)
  ) {
    throw new Error('server.js must normalize SESSION_COOKIE_SECURE inline without a single-use parseBoolean helper.');
  }
  if (!/if \(!sessionCookieSecure\) \{\s*throw new Error\('SESSION_COOKIE_SECURE must be true in production\.'\);\s*\}/.test(serverSource)) {
    throw new Error('server.js must reject insecure admin session cookies in production runtime config.');
  }
  if (
    /const normalizeSameSite\s*=|normalizeSameSite\(/.test(serverSource) ||
    !/const sessionCookieSameSite = String\(process\.env\.SESSION_COOKIE_SAME_SITE \|\| 'lax'\)\.toLowerCase\(\);[\s\S]*if \(!\['lax', 'strict', 'none'\]\.includes\(sessionCookieSameSite\)\) \{\s*throw new Error\('SESSION_COOKIE_SAME_SITE must be one of lax, strict, none\.'\);\s*\}/.test(serverSource) ||
    !/sameSite:\s*sessionCookieSameSite/.test(serverSource)
  ) {
    throw new Error('server.js must normalize SESSION_COOKIE_SAME_SITE inline without a single-use normalizeSameSite helper.');
  }
  if (
    !/const normalizePositiveInteger = \(value, defaultValue, envName\) => \{[\s\S]*const text = typeof value === 'number' \? String\(value\) : String\(value\)\.trim\(\);[\s\S]*const parsed = \/\^\[1-9\]\[0-9\]\*\$\/\.test\(text\) \? Number\(text\) : null;[\s\S]*if \(!Number\.isSafeInteger\(parsed\)\) \{[\s\S]*throw new Error\(`\$\{envName\} must be a positive integer\.`\);[\s\S]*return parsed;[\s\S]*\};/.test(serverSource)
  ) {
    throw new Error('server.js must strictly normalize positive integer env values without partial numeric parsing.');
  }
  if (
    !/for \(const name of \['ALLOW_OPEN_METRICS', 'ALLOW_OPEN_CORS'\]\) \{[\s\S]*const value = process\.env\[name\];[\s\S]*value !== undefined && value !== '' && !\['true', 'false'\]\.includes\(value\)[\s\S]*throw new Error\(`\$\{name\} must be true or false in production\.`\);/.test(serverSource)
  ) {
    throw new Error('server.js must reject invalid runtime boolean control flags in production.');
  }
  if (
    !/const DEFAULT_PORT = 3000;/.test(serverSource) ||
    !/const normalizeListenPort = \(value, defaultValue, envName\) => \{[\s\S]*const text = typeof value === 'number' \? String\(value\) : String\(value\)\.trim\(\);[\s\S]*const parsed = \/\^\(0\|\[1-9\]\[0-9\]\*\)\$\/\.test\(text\) \? Number\(text\) : null;[\s\S]*if \(!Number\.isSafeInteger\(parsed\) \|\| parsed > 65535\) \{[\s\S]*throw new Error\(`\$\{envName\} must be an integer between 0 and 65535\.`\);[\s\S]*return parsed;[\s\S]*\};/.test(serverSource) ||
    !/const productionPort = normalizeListenPort\(process\.env\.PORT, DEFAULT_PORT, 'PORT'\);[\s\S]*if \(productionPort === 0\) \{\s*throw new Error\('PORT must not be 0 in production\.'\);\s*\}/.test(serverSource) ||
    !/const PORT = normalizeListenPort\(process\.env\.PORT, DEFAULT_PORT, 'PORT'\);[\s\S]*httpServer\.listen\(PORT/.test(serverSource)
  ) {
    throw new Error('server.js must strictly normalize the listen PORT and reject PORT=0 in production.');
  }
  if (
    /const normalizeTrustProxy\s*=|normalizeTrustProxy\(/.test(serverSource) ||
    !/const trustProxyEnv = process\.env\.TRUST_PROXY;[\s\S]*let trustProxy;[\s\S]*const normalizedTrustProxy = String\(trustProxyEnv\)\.toLowerCase\(\);[\s\S]*\['1', 'true', 'yes', 'on'\]\.includes\(normalizedTrustProxy\)[\s\S]*trustProxy = 1;[\s\S]*\['0', 'false', 'no', 'off'\]\.includes\(normalizedTrustProxy\)[\s\S]*trustProxy = false;[\s\S]*const parsedTrustProxy = \/\^\(0\|\[1-9\]\[0-9\]\*\)\$\/\.test\(normalizedTrustProxy\) \? Number\(normalizedTrustProxy\) : null;[\s\S]*Number\.isSafeInteger\(parsedTrustProxy\)[\s\S]*app\.set\('trust proxy', trustProxy\);/.test(serverSource)
  ) {
    throw new Error('server.js must normalize TRUST_PROXY inline without a single-use normalizeTrustProxy helper.');
  }
  if (
    /const requireProductionEnv\s*=|forEach\(requireProductionEnv\)/.test(serverSource) ||
    !/for \(const name of \['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'\]\) \{\s*if \(!process\.env\[name\]\) \{\s*throw new Error\(`\$\{name\} must be set in production\.`\);\s*\}\s*\}/.test(serverSource)
  ) {
    throw new Error('server.js must inline required production DB env validation without a single-use requireProductionEnv helper.');
  }
  if (!/normalizePositiveInteger\(process\.env\.DB_PORT, 3306, 'DB_PORT'\);/.test(serverSource)) {
    throw new Error('server.js production runtime guard must strictly validate DB_PORT when provided.');
  }
  if (!/PLACEHOLDER_SECRETS\.has\(normalized\)/.test(serverSource) || !/\/\^\(change_this\|replace_with\|your\[_-\]\)\/i\.test\(text\)/.test(serverSource)) {
    throw new Error('server.js production strong secret guard must reject placeholder values case-insensitively.');
  }
  if (!/uppercase placeholder secret\/token smoke/.test(auditSource) || !/runtime\/frontend\/release guard drift/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document case-insensitive placeholder secret/token guard coverage.');
  }
  if (!/cleanupIntervalMs:\s*normalizePositiveInteger\(\s*process\.env\.SESSION_CLEANUP_INTERVAL_MS,\s*DEFAULT_CLEANUP_INTERVAL_MS,\s*'SESSION_CLEANUP_INTERVAL_MS'\s*\)/.test(serverSource)) {
    throw new Error('server.js must strictly validate SESSION_CLEANUP_INTERVAL_MS before configuring the MySQL session store.');
  }
  if (
    !/KIOSK_STATUS_TOKEN must be at least 16 characters when set in production/.test(serverSource) ||
    !/KIOSK_STATUS_TOKEN must not use placeholder values in production/.test(serverSource) ||
    !/KIOSK_STATUS_TOKEN must not contain whitespace in production/.test(serverSource)
  ) {
    throw new Error('server.js must reject unsafe optional KIOSK_STATUS_TOKEN values in production.');
  }
  if (
    /parseInt\(dbConfig\.port|Number\.parseInt\(dbConfig\.port/.test(dbSource) ||
    !/const rawPort = dbConfig\.port === undefined \|\| dbConfig\.port === '' \? 3306 : dbConfig\.port;/.test(dbSource) ||
    !/const portText = typeof rawPort === 'number' \? String\(rawPort\) : String\(rawPort\)\.trim\(\);/.test(dbSource) ||
    !/const dbPort = \/\^\[1-9\]\[0-9\]\*\$\/\.test\(portText\) \? Number\(portText\) : null;/.test(dbSource) ||
    !/if \(!Number\.isSafeInteger\(dbPort\) \|\| dbPort > 65535\) \{[\s\S]*DB_PORT must be a positive integer between 1 and 65535/.test(dbSource) ||
    !/port:\s*dbPort/.test(dbSource)
  ) {
    throw new Error('models/db.js must strictly normalize DB_PORT without partial numeric parsing.');
  }
  const cases = [
    ['weak secret', 'short'],
    ['placeholder secret', 'your-super-secret-jwt-key-at-least-32-characters'],
    ['uppercase placeholder secret', 'Your-Super-Secret-Jwt-Key-At-Least-32-Characters']
  ];

  cases.forEach(([label, jwtSecret]) => {
    const result = spawnSync(process.execPath, ['src/server.js'], {
      cwd: rootDir,
      env: {
        ...baseEnv,
        JWT_SECRET: jwtSecret
      },
      encoding: 'utf8',
      timeout: 5000
    });

    if (result.status === 0) {
      throw new Error(`Production runtime config guard should reject ${label} before startup.`);
    }

    if (!`${result.stdout}\n${result.stderr}`.includes('JWT_SECRET must be set')) {
      throw new Error(`Production runtime config guard did not report the expected JWT_SECRET validation failure for ${label}.`);
    }
  });

  const missingDatabaseEnv = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      DB_HOST: '',
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (missingDatabaseEnv.status === 0 || !`${missingDatabaseEnv.stdout}\n${missingDatabaseEnv.stderr}`.includes('DB_HOST must be set in production')) {
    throw new Error('Production runtime config guard should reject missing DB_HOST before startup.');
  }

  const missingMetricsToken = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      METRICS_TOKEN: ''
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (missingMetricsToken.status === 0 || !`${missingMetricsToken.stdout}\n${missingMetricsToken.stderr}`.includes('METRICS_TOKEN must be set in production')) {
    throw new Error('Production runtime config guard should reject missing METRICS_TOKEN before startup.');
  }

  const weakMetricsToken = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      METRICS_TOKEN: 'short'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (weakMetricsToken.status === 0 || !`${weakMetricsToken.stdout}\n${weakMetricsToken.stderr}`.includes('METRICS_TOKEN must be set to a non-placeholder value')) {
    throw new Error('Production runtime config guard should reject weak METRICS_TOKEN before startup.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-runtime-metrics-file-'));
  const metricsTokenFile = path.join(tempDir, 'metrics_token');
  try {
    fs.writeFileSync(metricsTokenFile, 'valid-metrics-token-from-file-at-least-32-characters');
    const fileBackedMetricsToken = spawnSync(process.execPath, ['src/server.js'], {
      cwd: rootDir,
      env: {
        ...baseEnv,
        JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
        METRICS_TOKEN: '',
        METRICS_TOKEN_FILE: metricsTokenFile,
        CORS_ORIGIN: 'http://localhost:5173'
      },
      encoding: 'utf8',
      timeout: 5000
    });

    if (fileBackedMetricsToken.status === 0 || !`${fileBackedMetricsToken.stdout}\n${fileBackedMetricsToken.stderr}`.includes('CORS_ORIGIN must not use local origins in production')) {
      throw new Error('Production runtime config guard should load METRICS_TOKEN_FILE before validating production metrics.');
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  [
    ['weak kiosk status token', 'short', 'KIOSK_STATUS_TOKEN must be at least 16 characters'],
    ['placeholder kiosk status token', 'change_this_shared_status_token', 'KIOSK_STATUS_TOKEN must not use placeholder values'],
    ['whitespace kiosk status token', 'valid kiosk status token', 'KIOSK_STATUS_TOKEN must not contain whitespace']
  ].forEach(([label, kioskStatusToken, expectedMessage]) => {
    const result = spawnSync(process.execPath, ['src/server.js'], {
      cwd: rootDir,
      env: {
        ...baseEnv,
        JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
        KIOSK_STATUS_TOKEN: kioskStatusToken
      },
      encoding: 'utf8',
      timeout: 5000
    });

    if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes(expectedMessage)) {
      throw new Error(`Production runtime config guard should reject ${label} before startup.`);
    }
  });

  const localhostCors = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      CORS_ORIGIN: 'http://localhost:5173'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (localhostCors.status === 0 || !`${localhostCors.stdout}\n${localhostCors.stderr}`.includes('CORS_ORIGIN must not use local origins in production')) {
    throw new Error('Production runtime config guard should reject localhost CORS_ORIGIN before startup.');
  }

  const localPublicUrl = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      KIOSK_FRONTEND_URL: 'http://0.0.0.0:5173'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (localPublicUrl.status === 0 || !`${localPublicUrl.stdout}\n${localPublicUrl.stderr}`.includes('KIOSK_FRONTEND_URL must not use a local URL in production')) {
    throw new Error('Production runtime config guard should reject local KIOSK_FRONTEND_URL before startup.');
  }

  const memorySessionStore = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      SESSION_STORE: 'memory'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (memorySessionStore.status === 0 || !`${memorySessionStore.stdout}\n${memorySessionStore.stderr}`.includes('SESSION_STORE must be mysql in production')) {
    throw new Error('Production runtime config guard should reject memory session store before startup.');
  }

  const partialSessionCleanupInterval = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      SESSION_CLEANUP_INTERVAL_MS: '900000abc'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (partialSessionCleanupInterval.status === 0 || !`${partialSessionCleanupInterval.stdout}\n${partialSessionCleanupInterval.stderr}`.includes('SESSION_CLEANUP_INTERVAL_MS must be a positive integer')) {
    throw new Error('Production runtime config guard should reject partial numeric SESSION_CLEANUP_INTERVAL_MS before startup.');
  }

  const invalidReadinessTimeout = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      READINESS_DB_TIMEOUT_MS: '0'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (invalidReadinessTimeout.status === 0 || !`${invalidReadinessTimeout.stdout}\n${invalidReadinessTimeout.stderr}`.includes('READINESS_DB_TIMEOUT_MS must be a positive integer')) {
    throw new Error('Production runtime config guard should reject invalid READINESS_DB_TIMEOUT_MS before startup.');
  }

  const partialDatabasePort = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      DB_PORT: '3306abc'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (partialDatabasePort.status === 0 || !`${partialDatabasePort.stdout}\n${partialDatabasePort.stderr}`.includes('DB_PORT must be a positive integer')) {
    throw new Error('Production runtime config guard should reject partial numeric DB_PORT before startup.');
  }

  const partialListenPort = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      PORT: '3000abc'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (partialListenPort.status === 0 || !`${partialListenPort.stdout}\n${partialListenPort.stderr}`.includes('PORT must be an integer between 0 and 65535.')) {
    throw new Error('Production runtime config guard should reject partial numeric PORT before startup.');
  }

  const ephemeralProductionPort = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      PORT: '0'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (ephemeralProductionPort.status === 0 || !`${ephemeralProductionPort.stdout}\n${ephemeralProductionPort.stderr}`.includes('PORT must not be 0 in production.')) {
    throw new Error('Production runtime config guard should reject PORT=0 before startup.');
  }

  const partialReadinessTimeout = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      READINESS_DB_TIMEOUT_MS: '2000abc'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (partialReadinessTimeout.status === 0 || !`${partialReadinessTimeout.stdout}\n${partialReadinessTimeout.stderr}`.includes('READINESS_DB_TIMEOUT_MS must be a positive integer')) {
    throw new Error('Production runtime config guard should reject partial numeric READINESS_DB_TIMEOUT_MS before startup.');
  }

  const invalidRequestBodyLimit = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      REQUEST_BODY_LIMIT: '0mb'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (invalidRequestBodyLimit.status === 0 || !`${invalidRequestBodyLimit.stdout}\n${invalidRequestBodyLimit.stderr}`.includes('REQUEST_BODY_LIMIT must be a positive byte size')) {
    throw new Error('Production runtime config guard should reject invalid REQUEST_BODY_LIMIT before startup.');
  }

  const invalidRateLimit = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      AUTH_RATE_LIMIT_MAX_REQUESTS: '0'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (invalidRateLimit.status === 0 || !`${invalidRateLimit.stdout}\n${invalidRateLimit.stderr}`.includes('AUTH_RATE_LIMIT_MAX_REQUESTS must be a positive integer')) {
    throw new Error('Production runtime config guard should reject invalid AUTH_RATE_LIMIT_MAX_REQUESTS before startup.');
  }

  [
    ['ALLOW_OPEN_METRICS', 'yes'],
    ['ALLOW_OPEN_CORS', '1']
  ].forEach(([envName, value]) => {
    const result = spawnSync(process.execPath, ['src/server.js'], {
      cwd: rootDir,
      env: {
        ...baseEnv,
        JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
        [envName]: value
      },
      encoding: 'utf8',
      timeout: 5000
    });

    if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes(`${envName} must be true or false in production`)) {
      throw new Error(`Production runtime config guard should reject invalid ${envName} before startup.`);
    }
  });

  const insecureSessionCookie = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      SESSION_COOKIE_SECURE: 'false'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (insecureSessionCookie.status === 0 || !`${insecureSessionCookie.stdout}\n${insecureSessionCookie.stderr}`.includes('SESSION_COOKIE_SECURE must be true in production')) {
    throw new Error('Production runtime config guard should reject SESSION_COOKIE_SECURE=false before startup.');
  }

  const invalidSessionCookieSecure = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      SESSION_COOKIE_SECURE: 'maybe'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (invalidSessionCookieSecure.status === 0 || !`${invalidSessionCookieSecure.stdout}\n${invalidSessionCookieSecure.stderr}`.includes('Invalid boolean environment value: maybe')) {
    throw new Error('Production runtime config guard should reject invalid SESSION_COOKIE_SECURE before startup.');
  }

  const invalidSessionCookieSameSite = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      SESSION_COOKIE_SAME_SITE: 'wide-open'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (invalidSessionCookieSameSite.status === 0 || !`${invalidSessionCookieSameSite.stdout}\n${invalidSessionCookieSameSite.stderr}`.includes('SESSION_COOKIE_SAME_SITE must be one of lax, strict, none.')) {
    throw new Error('Production runtime config guard should reject invalid SESSION_COOKIE_SAME_SITE before startup.');
  }

  const invalidTrustProxy = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      TRUST_PROXY: 'behind-one-proxy'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (invalidTrustProxy.status === 0 || !`${invalidTrustProxy.stdout}\n${invalidTrustProxy.stderr}`.includes('TRUST_PROXY must be boolean-like or a non-negative integer.')) {
    throw new Error('Production runtime config guard should reject invalid TRUST_PROXY before startup.');
  }

  const partialTrustProxy = spawnSync(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...baseEnv,
      JWT_SECRET: 'valid-jwt-secret-at-least-32-characters',
      TRUST_PROXY: '1abc'
    },
    encoding: 'utf8',
    timeout: 5000
  });

  if (partialTrustProxy.status === 0 || !`${partialTrustProxy.stdout}\n${partialTrustProxy.stderr}`.includes('TRUST_PROXY must be boolean-like or a non-negative integer.')) {
    throw new Error('Production runtime config guard should reject partial numeric TRUST_PROXY before startup.');
  }

  console.log('ok production runtime config guard');
};

const verifyGracefulShutdownContract = () => {
  const serverSource = fs.readFileSync(path.join(rootDir, 'src/server.js'), 'utf8');
  const sessionStoreSource = fs.readFileSync(path.join(rootDir, 'src/utils/mysqlSessionStore.js'), 'utf8');

  if (!/const databasePool = require\('\.\/models\/db'\)/.test(serverSource)) {
    throw new Error('server.js must keep a named databasePool handle for graceful shutdown.');
  }
  if (/\bcloseRuntimeResources\b/.test(serverSource)) {
    throw new Error('server.js must close runtime resources inline without a single-use closeRuntimeResources wrapper.');
  }
  if (/\bcloseHttpServer\b/.test(serverSource)) {
    throw new Error('server.js must close the HTTP server inline without a single-use closeHttpServer wrapper.');
  }
  if (!/await new Promise\(\(resolve, reject\) => \{[\s\S]*httpServer\.close\(\(error\) => \{[\s\S]*reject\(error\);[\s\S]*resolve\(\);[\s\S]*\}\);[\s\S]*\}\);/.test(serverSource)) {
    throw new Error('server.js must stop accepting HTTP connections during graceful shutdown.');
  }
  if (!/if \(sessionStore && typeof sessionStore\.close === 'function'\) \{[\s\S]*sessionStore\.close\(\);[\s\S]*\}/.test(serverSource) || !/if \(databasePool && typeof databasePool\.end === 'function'\) \{[\s\S]*await databasePool\.end\(\);[\s\S]*\}/.test(serverSource)) {
    throw new Error('server.js must close the session store and MySQL pool during graceful shutdown.');
  }
  if (!/process\.env\.SHUTDOWN_TIMEOUT_MS/.test(serverSource) || !/Graceful shutdown timed out/.test(serverSource)) {
    throw new Error('server.js must bound graceful shutdown with SHUTDOWN_TIMEOUT_MS.');
  }
  if (!/shutdown\('SIGTERM'\)/.test(serverSource) || !/shutdown\('SIGINT'\)/.test(serverSource) || !/shutdown\('unhandledRejection', 1\)/.test(serverSource)) {
    throw new Error('server.js must route SIGTERM, SIGINT, and unhandledRejection through the same shutdown path.');
  }
  if (!/close\(\)\s*\{[\s\S]*clearInterval\(this\.cleanupTimer\)[\s\S]*this\.cleanupTimer = null/.test(sessionStoreSource)) {
    throw new Error('MySQLSessionStore must expose close() and clear its cleanup interval.');
  }
  if (/const parseSessionData\s*=/.test(sessionStoreSource) || !/const sessionData = rows\[0\]\.data;\s*callback\(null, sessionData \? \(typeof sessionData === 'string' \? JSON\.parse\(sessionData\) : sessionData\) : null\);/.test(sessionStoreSource)) {
    throw new Error('MySQLSessionStore.get must parse row data directly instead of keeping a single-use parseSessionData wrapper.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-shutdown-'));
  const logPath = path.join(tempDir, 'server.log');
  const script = [
    'node src/server.js > "$SERVER_LOG" 2>&1 &',
    'pid=$!',
    'for _ in $(seq 1 40); do',
    '  if grep -q "Server is running on port" "$SERVER_LOG"; then break; fi',
    '  if ! kill -0 "$pid" 2>/dev/null; then cat "$SERVER_LOG"; wait "$pid"; exit 1; fi',
    '  sleep 0.1',
    'done',
    'if ! grep -q "Server is running on port" "$SERVER_LOG"; then',
    '  cat "$SERVER_LOG"',
    '  kill -TERM "$pid" 2>/dev/null || true',
    '  wait "$pid" 2>/dev/null || true',
    '  exit 1',
    'fi',
    'sleep 0.2',
    'kill -TERM "$pid"',
    'wait "$pid"',
    'grep -q "Runtime resources closed. Process terminated." "$SERVER_LOG"'
  ].join('\n');

  try {
    const result = spawnSync('bash', ['-c', script], {
      cwd: rootDir,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        LOG_DIR: path.join(tempDir, 'logs'),
        SERVER_LOG: logPath,
        PORT: '0',
        DB_HOST: '127.0.0.1',
        DB_PORT: '1',
        DB_USER: 'root',
        DB_PASSWORD: 'root',
        DB_NAME: 'aiosk_static_shutdown',
        SESSION_STORE: 'mysql',
        SHUTDOWN_TIMEOUT_MS: '2000'
      },
      encoding: 'utf8',
      timeout: 10000
    });

    if (result.status !== 0) {
      const serverLog = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
      throw new Error(`Graceful shutdown smoke failed:\n${result.stdout}\n${result.stderr}\n${serverLog}`);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('ok graceful shutdown contract');
};

const verifyDatabaseSchemaContract = () => {
  const schemaSource = fs.readFileSync(path.join(rootDir, 'database_schema.sql'), 'utf8');
  const sessionMigrationSource = fs.readFileSync(
    path.join(rootDir, 'database/migrations/202605280002_add_sessions.up.sql'),
    'utf8'
  );
  const serverSource = fs.readFileSync(path.join(rootDir, 'src/server.js'), 'utf8');
  const kioskStatusModelSource = fs.readFileSync(path.join(rootDir, 'src/models/kioskStatus.model.js'), 'utf8');

  if (!/CREATE TABLE IF NOT EXISTS `Sessions`/.test(schemaSource)) {
    throw new Error('database_schema.sql must define the Sessions table for the MySQL session store.');
  }
  if (!/`status` VARCHAR\(50\) NOT NULL DEFAULT 'RECEIVED'/.test(schemaSource)) {
    throw new Error('Orders.status must keep the RECEIVED schema default used by public order creation.');
  }
  if (!/`expires_at` TIMESTAMP\(3\) NOT NULL/.test(schemaSource)) {
    throw new Error('Sessions table must include an indexed millisecond expiration column.');
  }
  if (!/CREATE TABLE IF NOT EXISTS `Sessions`/.test(sessionMigrationSource)) {
    throw new Error('Sessions migration must create the Sessions table.');
  }
  if (!/const databasePool = require\('\.\/models\/db'\)/.test(serverSource) || !/new MySQLSessionStore\(databasePool/.test(serverSource)) {
    throw new Error('server.js must wire express-session to the MySQL session store.');
  }
  if (!/SESSION_STORE must be mysql in production/.test(serverSource)) {
    throw new Error('server.js must reject memory session store in production.');
  }
  if (/KioskStatus\.findByKioskId\s*=|const findByKioskId\s*=|findByKioskId\(/.test(kioskStatusModelSource) || !/KioskStatus\.upsert = async[\s\S]*WHERE kiosk_id = \?[\s\S]*return rows\.length \? normalizeRow\(rows\[0\]\) : null;/.test(kioskStatusModelSource)) {
    throw new Error('KioskStatus.upsert must not keep a single-use findByKioskId wrapper.');
  }
  const kioskStatusModelValidatesWrites = [
    /const KIOSK_ID_PATTERN = \/\^\[A-Za-z0-9\._-\]\{1,100\}\$\/;/.test(kioskStatusModelSource),
    /const normalizeTextField = \(value, maxLength, fieldName\) => \{[\s\S]*if \(value === undefined \|\| value === null \|\| value === ''\) return null;[\s\S]*if \(typeof value !== 'string'\) \{[\s\S]*throw new Error\(`\$\{fieldName\} must be a string\.`\);[\s\S]*return text \? text\.slice\(0, maxLength\) : null;[\s\S]*\};/.test(kioskStatusModelSource),
    /const normalizeStatus = \(value\) => \{[\s\S]*const status = normalizeTextField\(value, 50, 'status'\);[\s\S]*STATUS_VALUES\.includes\(status\)[\s\S]*status must be one of/.test(kioskStatusModelSource),
    /const kioskId = normalizeTextField\(statusData\.kiosk_id, 100, 'kiosk_id'\);[\s\S]*if \(!kioskId \|\| !KIOSK_ID_PATTERN\.test\(kioskId\)\) \{[\s\S]*kiosk_id must be 1-100 characters[\s\S]*const status = normalizeStatus\(statusData\.status\);[\s\S]*label: normalizeTextField\(statusData\.label, 255, 'label'\),[\s\S]*app_version: normalizeTextField\(statusData\.app_version, 100, 'app_version'\),[\s\S]*ip_address: normalizeTextField\(statusData\.ip_address, 45, 'ip_address'\),[\s\S]*user_agent: normalizeTextField\(statusData\.user_agent, 512, 'user_agent'\)/.test(kioskStatusModelSource)
  ].every(Boolean);
  if (
    /const normalizeKioskId\s*=|normalizeKioskId\(|kiosk_id:\s*statusData\.kiosk_id|label:\s*statusData\.label \|\| null|status:\s*statusData\.status,|app_version:\s*statusData\.app_version \|\| null/.test(kioskStatusModelSource) ||
    !kioskStatusModelValidatesWrites
  ) {
    throw new Error('KioskStatus.upsert must validate kiosk id, status, and optional text fields before DB writes.');
  }
  if (
    /const normalizeLimit\s*=|parseInt\(options\.limit, 10\)/.test(kioskStatusModelSource) ||
    !/const rawLimit = typeof options\.limit === 'string' \? options\.limit\.trim\(\) : '';[\s\S]*const normalizedLimit = typeof options\.limit === 'number'[\s\S]*\/\^\[1-9\]\[0-9\]\*\$\/\.test\(rawLimit\) \? Number\(rawLimit\) : null[\s\S]*const limit = Number\.isSafeInteger\(normalizedLimit\) && normalizedLimit > 0 \? Math\.min\(normalizedLimit, 500\) : 100;/.test(kioskStatusModelSource)
  ) {
    throw new Error('KioskStatus.getAll must keep strict safe-integer limit normalization local instead of a single-call wrapper.');
  }
  if (/offlineAfterSeconds|normalizeOfflineAfterSeconds/.test(kioskStatusModelSource)) {
    throw new Error('KioskStatus model must not keep unused offlineAfterSeconds option plumbing; the current offline window is fixed in the model.');
  }
  if (/status:\s*statusData\.status\s*\|\|\s*['"]ONLINE['"]/.test(kioskStatusModelSource)) {
    throw new Error('KioskStatus.upsert must not fallback status after the public status controller normalizes and validates it.');
  }

  console.log('ok database schema contract');
};

const verifyUploadConfigContract = () => {
  const script = `
process.env.UPLOAD_DIR = 'custom_uploads';
process.env.MAX_FILE_SIZE = '12345';
const uploadConfig = require('./src/config/upload.config');
if (!uploadConfig.uploadRoot.endsWith('/custom_uploads')) {
  throw new Error('UPLOAD_DIR was not applied to uploadRoot');
}
if (!uploadConfig.menuUploadDir.endsWith('/custom_uploads/menus')) {
  throw new Error('UPLOAD_DIR was not applied to menuUploadDir');
}
if (uploadConfig.maxFileSize !== 12345) {
  throw new Error('MAX_FILE_SIZE was not applied');
}
`;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: rootDir,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error(`Upload config verification failed:\n${result.stdout}\n${result.stderr}`);
  }

  const invalidMaxFileSize = spawnSync(process.execPath, ['-e', `
  process.env.MAX_FILE_SIZE = '123abc';
  require('./src/config/upload.config');
  `], {
    cwd: rootDir,
    encoding: 'utf8'
  });

  if (invalidMaxFileSize.status === 0 || !`${invalidMaxFileSize.stdout}\n${invalidMaxFileSize.stderr}`.includes('MAX_FILE_SIZE must be a positive integer.')) {
    throw new Error('Upload config must reject partial numeric MAX_FILE_SIZE values.');
  }

  const serverSource = fs.readFileSync(path.join(rootDir, 'src/server.js'), 'utf8');
  const uploadConfigSource = fs.readFileSync(path.join(rootDir, 'src/config/upload.config.js'), 'utf8');
  const uploadMiddlewareSource = fs.readFileSync(path.join(rootDir, 'src/middleware/upload.middleware.js'), 'utf8');
  const menuRoutesSource = fs.readFileSync(path.join(rootDir, 'src/routes/menu.routes.js'), 'utf8');
  const menuControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/menu.controller.js'), 'utf8');
  const swaggerSource = fs.readFileSync(path.join(rootDir, 'src/config/swagger.config.js'), 'utf8');
  const e2eSource = fs.readFileSync(path.join(rootDir, 'scripts/e2e-db-api.js'), 'utf8');
  const auditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');
  const uploadOpenApiBlock = (menuRoutesSource.match(/\/api\/menus\/\{menuId\}\/image:[\s\S]*?\n \*\/\n\n\/\*\*/) || [''])[0];

  if (!/express\.static\(uploadRoot\)/.test(serverSource)) {
    throw new Error('server.js must serve uploads from upload.config uploadRoot.');
  }
  if (/express\.static\(['"]uploads['"]\)/.test(serverSource)) {
    throw new Error('server.js must not hard-code the uploads static directory.');
  }
  if (
    /const normalizePositiveInteger\s*=|normalizePositiveInteger\(|Number\.parseInt\(process\.env\.MAX_FILE_SIZE|parseInt\(process\.env\.MAX_FILE_SIZE/.test(uploadConfigSource) ||
    !/const rawMaxFileSize = process\.env\.MAX_FILE_SIZE;/.test(uploadConfigSource) ||
    !/const maxFileSizeText = typeof rawMaxFileSize === 'number' \? String\(rawMaxFileSize\) : String\(rawMaxFileSize \|\| ''\)\.trim\(\);/.test(uploadConfigSource) ||
    !/const parsedMaxFileSize = rawMaxFileSize === undefined \|\| rawMaxFileSize === ''[\s\S]*\? DEFAULT_MAX_FILE_SIZE[\s\S]*: \(\/\^\[1-9\]\[0-9\]\*\$\/\.test\(maxFileSizeText\) \? Number\(maxFileSizeText\) : null\);/.test(uploadConfigSource) ||
    !/if \(!Number\.isSafeInteger\(parsedMaxFileSize\)\) \{\s*throw new Error\('MAX_FILE_SIZE must be a positive integer\.'\);\s*\}/.test(uploadConfigSource) ||
    !/maxFileSize: parsedMaxFileSize/.test(uploadConfigSource)
  ) {
    throw new Error('upload.config.js must normalize MAX_FILE_SIZE inline without a single-use positive-integer wrapper.');
  }
  if (!/fileSize: maxFileSize/.test(uploadMiddlewareSource)) {
    throw new Error('upload.middleware.js must use MAX_FILE_SIZE through upload.config.');
  }
  if (
    /req\.params\.menuId \|\| 'unknown'|menu-\$\{req\.params\.menuId\}/.test(uploadMiddlewareSource) ||
    !/const rawMenuId = typeof req\.params\?\.menuId === 'string' \? req\.params\.menuId\.trim\(\) : '';[\s\S]*const parsedMenuId = \/\^\[1-9\]\[0-9\]\*\$\/\.test\(rawMenuId\) \? Number\(rawMenuId\) : null;[\s\S]*const menuId = Number\.isSafeInteger\(parsedMenuId\) \? rawMenuId : 'invalid';[\s\S]*const filename = `menu-\$\{menuId\}-\$\{timestamp\}\$\{ext\}`;/.test(uploadMiddlewareSource)
  ) {
    throw new Error('upload.middleware.js must not put raw or missing menuId route params into stored filenames before controller validation.');
  }
  if (/formatFileSize/.test(uploadMiddlewareSource) || !/const maxFileSizeMiB = maxFileSize \/ \(1024 \* 1024\);[\s\S]*const maxFileSizeLabel = `\$\{Number\.isInteger\(maxFileSizeMiB\) \? maxFileSizeMiB : maxFileSizeMiB\.toFixed\(1\)\}MB`;[\s\S]*최대 \$\{maxFileSizeLabel\}까지 업로드 가능합니다/.test(uploadMiddlewareSource)) {
    throw new Error('upload.middleware.js must not keep a single-use formatFileSize helper; LIMIT_FILE_SIZE response owns the size label directly.');
  }
  if (/ensureUploadDir/.test(uploadMiddlewareSource) || !/if \(!fs\.existsSync\(menuUploadDir\)\) \{\s*fs\.mkdirSync\(menuUploadDir, \{ recursive: true \}\);\s*\}/.test(uploadMiddlewareSource)) {
    throw new Error('upload.middleware.js must create the upload directory at the storage destination without a single-call wrapper.');
  }
  if (!/ALLOWED_IMAGE_TYPES = new Map/.test(uploadMiddlewareSource) || !/ALLOWED_IMAGE_EXTENSIONS/.test(uploadMiddlewareSource) || !/invalid_extension/.test(uploadMiddlewareSource)) {
    throw new Error('upload.middleware.js must validate both uploaded image MIME types and file extensions.');
  }
  if (
    /const fileFilter\s*=|fileFilter:\s*fileFilter/.test(uploadMiddlewareSource) ||
    !/fileFilter:\s*\(req, file, cb\) => \{[\s\S]*const originalExtension = path\.extname\(file\.originalname\)\.toLowerCase\(\);[\s\S]*const allowedExtensions = ALLOWED_IMAGE_TYPES\.get\(file\.mimetype\);[\s\S]*if \(!allowedExtensions\) \{[\s\S]*error\.mimetype = file\.mimetype;[\s\S]*if \(!ALLOWED_IMAGE_EXTENSIONS\.has\(originalExtension\) \|\| !allowedExtensions\.has\(originalExtension\)\) \{[\s\S]*error\.extension = originalExtension;[\s\S]*error\.mimetype = file\.mimetype;[\s\S]*return cb\(null, true\);[\s\S]*\},/.test(uploadMiddlewareSource)
  ) {
    throw new Error('upload.middleware.js must inline image file filtering without a single-use fileFilter helper.');
  }
  if (!/Upload rejected/.test(uploadMiddlewareSource) || !/logger\.logWarning/.test(uploadMiddlewareSource) || !/logger\.logError\(error, req, \{ context: 'Upload middleware' \}\)/.test(uploadMiddlewareSource)) {
    throw new Error('upload.middleware.js must log rejected uploads and unexpected upload errors.');
  }
  if (!/imageUrl:\s*imageUrl/.test(menuControllerSource) || !/filename:\s*req\.file\.filename/.test(menuControllerSource) || !/menuId:\s*menuId/.test(menuControllerSource)) {
    throw new Error('menu.controller.js upload response contract changed without verifier update.');
  }
  if (
    !/const removeUploadedFile = \(file, req, context\) => \{[\s\S]*fs\.unlinkSync\(file\.path\);[\s\S]*logger\.logError\(unlinkError, req, \{ context \}\);[\s\S]*\};/.test(menuControllerSource) ||
    !/if \(menuId === null\) \{[\s\S]*removeUploadedFile\(req\.file, req, 'Menu image upload cleanup'\);[\s\S]*return res\.status\(400\)\.json\(\{ message: "유효하지 않은 메뉴 ID입니다\." \}\);[\s\S]*\}/.test(menuControllerSource)
  ) {
    throw new Error('menu.controller.js must clean up uploaded files when rejecting an invalid menu image ID after multer runs.');
  }
  if (
    /const requestMultipart\s*=|requestMultipart\(/.test(e2eSource) ||
    !/const uploadRoute = `\/api\/menus\/\$\{menu\.id\}\/image`;/.test(e2eSource) ||
    !/const uploadResponse = await fetch\(`\$\{baseUrl\}\$\{uploadRoute\}`, \{[\s\S]*method: 'POST'[\s\S]*Authorization: `Bearer \$\{token\}`[\s\S]*body: imageForm/.test(e2eSource) ||
    !/const uploadText = await uploadResponse\.text\(\);[\s\S]*uploadedImage = JSON\.parse\(uploadText\);[\s\S]*POST \$\{uploadRoute\} returned non-JSON response/.test(e2eSource) ||
    !/assert\.equal\(\s*uploadResponse\.status,\s*200,[\s\S]*POST \$\{uploadRoute\} expected 200/.test(e2eSource) ||
    !/assert\.match\(uploadedImage\.imageUrl,[\s\S]*\\\/uploads\\\/menus\\\/menu-[\s\S]*\\\.png/.test(e2eSource)
  ) {
    throw new Error('DB/API E2E must inline menu image upload verification without a single-use requestMultipart helper.');
  }
  if (!/e2e-db-api\.js`의 `requestMultipart\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the DB/API E2E requestMultipart helper removal.');
  }
  if (/^\s*\*\s+(success|data|originalName|fileSize):/m.test(uploadOpenApiBlock) || /1672812345_americano/.test(uploadOpenApiBlock)) {
    throw new Error('Menu image upload OpenAPI response must not document stale wrapper or file metadata fields.');
  }
  if (!/webp 지원/.test(uploadOpenApiBlock) || !/imageUrl:/.test(uploadOpenApiBlock) || !/filename:/.test(uploadOpenApiBlock) || !/menu-1-1700000000000\.jpg/.test(uploadOpenApiBlock)) {
    throw new Error('Menu image upload OpenAPI response must document the current upload contract and filename pattern.');
  }
  if (/\/uploads\/menus\/americano\.jpg/.test(swaggerSource) || !/\/uploads\/menus\/menu-1-1700000000000\.jpg/.test(swaggerSource)) {
    throw new Error('Swagger Menu.image_url example must match the upload filename pattern.');
  }
  if (/5 \* 1024 \* 1024/.test(uploadMiddlewareSource)) {
    throw new Error('upload.middleware.js must not hard-code the upload size limit.');
  }
  if (/path\.join\(__dirname, ['"]\.\.\/\.\.\/uploads\/menus['"]\)/.test(uploadMiddlewareSource)) {
    throw new Error('upload.middleware.js must not hard-code the menu upload directory.');
  }

  const productionEnvSource = fs.readFileSync(path.join(rootDir, '.env.production.example'), 'utf8');
  if (!/^UPLOAD_DIR=uploads$/m.test(productionEnvSource) || !/^MAX_FILE_SIZE=5242880$/m.test(productionEnvSource)) {
    throw new Error('.env.production.example must declare upload runtime configuration.');
  }

  console.log('ok upload config contract');
};

const verifyReadinessConfigContract = () => {
  const productionEnvSource = fs.readFileSync(path.join(rootDir, '.env.production.example'), 'utf8');
  const composeSource = fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8');
  const productionComposeSource = fs.readFileSync(path.join(rootDir, 'docker-compose.prod.yml'), 'utf8');
  const preflightSource = fs.readFileSync(path.join(rootDir, 'scripts/production-preflight.sh'), 'utf8');
  const serverSource = fs.readFileSync(path.join(rootDir, 'src/server.js'), 'utf8');
  const healthControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/health.controller.js'), 'utf8');

  if (!/^READINESS_DB_TIMEOUT_MS=2000$/m.test(productionEnvSource)) {
    throw new Error('.env.production.example must declare READINESS_DB_TIMEOUT_MS.');
  }
  if (!/READINESS_DB_TIMEOUT_MS:\s*\$\{READINESS_DB_TIMEOUT_MS:-2000\}/.test(composeSource) || !/READINESS_DB_TIMEOUT_MS:\s*\$\{READINESS_DB_TIMEOUT_MS:-2000\}/.test(productionComposeSource)) {
    throw new Error('Compose files must pass READINESS_DB_TIMEOUT_MS through to the backend service.');
  }
  if (!/validate_readiness_policy/.test(preflightSource) || !/READINESS_DB_TIMEOUT_MS must be a positive integer/.test(preflightSource)) {
    throw new Error('production preflight must validate READINESS_DB_TIMEOUT_MS.');
  }
  if (!/READINESS_DB_TIMEOUT_MS/.test(serverSource)) {
    throw new Error('server.js must validate READINESS_DB_TIMEOUT_MS in production.');
  }
  if (
    /getReadinessTimeoutMs|const withTimeout\s*=|Number\(process\.env\.READINESS_DB_TIMEOUT_MS \|\| DEFAULT_READINESS_TIMEOUT_MS\)|Number\.isFinite\(configuredTimeoutMs\)/.test(healthControllerSource) ||
    !/let timeoutMs = DEFAULT_READINESS_TIMEOUT_MS;/.test(healthControllerSource) ||
    !/const rawTimeoutMs = process\.env\.READINESS_DB_TIMEOUT_MS;[\s\S]*if \(rawTimeoutMs !== undefined && rawTimeoutMs !== ''\) \{[\s\S]*const timeoutText = typeof rawTimeoutMs === 'number'[\s\S]*\(typeof rawTimeoutMs === 'string' \? rawTimeoutMs\.trim\(\) : ''\);[\s\S]*const parsedTimeoutMs = \/\^\[1-9\]\[0-9\]\*\$\/\.test\(timeoutText\) \? Number\(timeoutText\) : null;[\s\S]*READINESS_CONFIG_INVALID[\s\S]*timeoutMs = parsedTimeoutMs;[\s\S]*\}/.test(healthControllerSource) ||
    !/await Promise\.race\(\[sql\.query\('SELECT 1 AS ok'\), timeout\]\)[\s\S]*\.finally\(\(\) => clearTimeout\(timeoutId\)\)/.test(healthControllerSource)
  ) {
    throw new Error('health.controller.js must keep strict readiness timeout normalization local instead of a single-use helper or silent fallback.');
  }

  console.log('ok readiness config contract');
};

const verifyRequestBodyLimitContract = () => {
  const productionEnvSource = fs.readFileSync(path.join(rootDir, '.env.production.example'), 'utf8');
  const composeSource = fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8');
  const productionComposeSource = fs.readFileSync(path.join(rootDir, 'docker-compose.prod.yml'), 'utf8');
  const preflightSource = fs.readFileSync(path.join(rootDir, 'scripts/production-preflight.sh'), 'utf8');
  const serverSource = fs.readFileSync(path.join(rootDir, 'src/server.js'), 'utf8');

  if (!/^REQUEST_BODY_LIMIT=1mb$/m.test(productionEnvSource)) {
    throw new Error('.env.production.example must declare REQUEST_BODY_LIMIT.');
  }
  if (!/REQUEST_BODY_LIMIT:\s*\$\{REQUEST_BODY_LIMIT:-1mb\}/.test(composeSource) || !/REQUEST_BODY_LIMIT:\s*\$\{REQUEST_BODY_LIMIT:-1mb\}/.test(productionComposeSource)) {
    throw new Error('Compose files must pass REQUEST_BODY_LIMIT through to the backend service.');
  }
  if (!/validate_request_body_policy/.test(preflightSource) || !/REQUEST_BODY_LIMIT must be a positive byte size/.test(preflightSource)) {
    throw new Error('production preflight must validate REQUEST_BODY_LIMIT.');
  }
  if (!/normalizeRequestBodyLimit/.test(serverSource) || !/express\.json\(\{ limit: requestBodyLimit \}\)/.test(serverSource) || !/express\.urlencoded\(\{ extended: true, limit: requestBodyLimit \}\)/.test(serverSource)) {
    throw new Error('server.js must apply REQUEST_BODY_LIMIT to JSON and URL-encoded parsers.');
  }
  if (/limit:\s*['"]10mb['"]/.test(serverSource)) {
    throw new Error('server.js must not hard-code the request body parser limit.');
  }

  console.log('ok request body size contract');
};

const verifyRateLimitContract = () => {
  const productionEnvSource = fs.readFileSync(path.join(rootDir, '.env.production.example'), 'utf8');
  const composeSource = fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8');
  const productionComposeSource = fs.readFileSync(path.join(rootDir, 'docker-compose.prod.yml'), 'utf8');
  const preflightSource = fs.readFileSync(path.join(rootDir, 'scripts/production-preflight.sh'), 'utf8');
  const serverSource = fs.readFileSync(path.join(rootDir, 'src/server.js'), 'utf8');
  const rateLimitSource = fs.readFileSync(path.join(rootDir, 'src/middleware/rateLimit.middleware.js'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');

  [
    'RATE_LIMIT_WINDOW_MS=60000',
    'RATE_LIMIT_MAX_REQUESTS=300',
    'AUTH_RATE_LIMIT_WINDOW_MS=60000',
    'AUTH_RATE_LIMIT_MAX_REQUESTS=20'
  ].forEach((line) => {
    if (!productionEnvSource.includes(line)) {
      throw new Error(`.env.production.example must declare ${line}.`);
    }
  });

  [
    /RATE_LIMIT_WINDOW_MS:\s*\$\{RATE_LIMIT_WINDOW_MS:-60000\}/,
    /RATE_LIMIT_MAX_REQUESTS:\s*\$\{RATE_LIMIT_MAX_REQUESTS:-300\}/,
    /AUTH_RATE_LIMIT_WINDOW_MS:\s*\$\{AUTH_RATE_LIMIT_WINDOW_MS:-60000\}/,
    /AUTH_RATE_LIMIT_MAX_REQUESTS:\s*\$\{AUTH_RATE_LIMIT_MAX_REQUESTS:-20\}/
  ].forEach((pattern) => {
    if (!pattern.test(composeSource) || !pattern.test(productionComposeSource)) {
      throw new Error(`Compose files must pass rate limit setting: ${pattern}`);
    }
  });

  if (!/validate_rate_limit_policy/.test(preflightSource) || !/AUTH_RATE_LIMIT_MAX_REQUESTS must be a positive integer/.test(preflightSource)) {
    throw new Error('production preflight must validate rate limit settings.');
  }
  if (!/createRateLimiter/.test(serverSource) || !/app\.use\('\/api', apiRateLimiter\)/.test(serverSource) || !/app\.use\('\/api\/admin\/login', postOnly\(authRateLimiter\)\)/.test(serverSource) || !/app\.use\('\/admin\/login', postOnly\(authRateLimiter\)\)/.test(serverSource)) {
    throw new Error('server.js must apply API and auth rate limit middleware.');
  }
  if (!/X-RateLimit-Remaining/.test(rateLimitSource) || !/Rate limit exceeded/.test(rateLimitSource) || !/status\(429\)/.test(rateLimitSource)) {
    throw new Error('rate limit middleware must expose headers, log rejects, and return 429.');
  }
  if (/\bgetClientKey\b|\bkeyGenerator\b/.test(rateLimitSource)) {
    throw new Error('rate limit middleware must not keep unused client key extension helpers.');
  }
  if (
    !rateLimitSource.includes("const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';") ||
    !rateLimitSource.includes('const key = `${name}:${clientIp}`;') ||
    !/ip:\s*clientIp/.test(rateLimitSource)
  ) {
    throw new Error('rate limit middleware must derive and log bucket keys from the request IP fallback chain.');
  }
  if (/Rate Limiting\*\*: 과도한 요청 방지 \(향후 추가 예정\)/.test(readmeSource)) {
    throw new Error('README.md must not describe rate limiting as future-only.');
  }

  console.log('ok rate limit contract');
};

const verifyShutdownTimeoutContract = () => {
  const serverSource = fs.readFileSync(path.join(rootDir, 'src/server.js'), 'utf8');
  const envSource = fs.readFileSync(path.join(rootDir, '.env.example'), 'utf8');
  const dockerEnvSource = fs.readFileSync(path.join(rootDir, '.env.docker.example'), 'utf8');
  const productionEnvSource = fs.readFileSync(path.join(rootDir, '.env.production.example'), 'utf8');
  const composeSource = fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8');
  const productionComposeSource = fs.readFileSync(path.join(rootDir, 'docker-compose.prod.yml'), 'utf8');
  const preflightSource = fs.readFileSync(path.join(rootDir, 'scripts/production-preflight.sh'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const runbookSource = fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8');

  [envSource, dockerEnvSource, productionEnvSource].forEach((source, index) => {
    if (!/^SHUTDOWN_TIMEOUT_MS=10000$/m.test(source)) {
      throw new Error(`env example ${index + 1} must declare SHUTDOWN_TIMEOUT_MS=10000.`);
    }
  });

  if (!/SHUTDOWN_TIMEOUT_MS:\s*\$\{SHUTDOWN_TIMEOUT_MS:-10000\}/.test(composeSource) || !/SHUTDOWN_TIMEOUT_MS:\s*\$\{SHUTDOWN_TIMEOUT_MS:-10000\}/.test(productionComposeSource)) {
    throw new Error('Compose files must pass SHUTDOWN_TIMEOUT_MS through to the backend service.');
  }
  if (!/validate_shutdown_policy/.test(preflightSource) || !/SHUTDOWN_TIMEOUT_MS must be a positive integer/.test(preflightSource)) {
    throw new Error('production preflight must validate SHUTDOWN_TIMEOUT_MS.');
  }
  if (/const getShutdownTimeoutMs\s*=|getShutdownTimeoutMs\(/.test(serverSource) || !/let timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS;[\s\S]*timeoutMs = normalizePositiveInteger\([\s\S]*process\.env\.SHUTDOWN_TIMEOUT_MS,[\s\S]*DEFAULT_SHUTDOWN_TIMEOUT_MS,[\s\S]*'SHUTDOWN_TIMEOUT_MS'[\s\S]*logger\.logError\(error, null, \{ context: 'Graceful shutdown config' \}\);[\s\S]*Graceful shutdown timed out after/.test(serverSource)) {
    throw new Error('server.js must validate and enforce SHUTDOWN_TIMEOUT_MS inline in the shutdown handler without a single-use timeout wrapper.');
  }
  if (!/SHUTDOWN_TIMEOUT_MS=10000/.test(`${readmeSource}\n${runbookSource}`) || !/SIGTERM\/SIGINT/.test(runbookSource)) {
    throw new Error('README/runbook must document SHUTDOWN_TIMEOUT_MS and signal shutdown behavior.');
  }

  console.log('ok shutdown timeout contract');
};

const verifyMetricsPreflightContract = () => {
  const preflightSource = fs.readFileSync(path.join(rootDir, 'scripts/production-preflight.sh'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const runbookSource = fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8');
  const auditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');
  const productionEnvSource = fs.readFileSync(path.join(rootDir, '.env.production.example'), 'utf8');
  const composeSource = fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8');
  const productionComposeSource = fs.readFileSync(path.join(rootDir, 'docker-compose.prod.yml'), 'utf8');
  const deployComposeSource = fs.readFileSync(path.join(rootDir, 'scripts/deploy-compose.sh'), 'utf8');
  const securePrometheusSource = fs.readFileSync(path.join(rootDir, 'monitoring/prometheus.secure.yml'), 'utf8');
  const serverSource = fs.readFileSync(path.join(rootDir, 'src/server.js'), 'utf8');
  const healthControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/health.controller.js'), 'utf8');
  const metricsSource = fs.readFileSync(path.join(rootDir, 'src/utils/metrics.js'), 'utf8');
  const metricsHandlerBlock = (healthControllerSource.match(/const getMetrics = \(req, res\) => \{[\s\S]*?res\.send\(renderPrometheusMetrics\(\)\);\n\};/) || [''])[0];
  const metricsLabelSetBlock = (metricsSource.match(/const labelSet = \(labels\) => Object\.entries\(labels\)[\s\S]*?\.join\(','\);/) || [''])[0];

  if (!/if \[ "\$#" -ne 0 \]; then\s+echo "Usage: \$0" >&2\s+exit 1\s+fi/.test(preflightSource)) {
    throw new Error('production preflight must reject unexpected positional arguments before preflight work.');
  }
  const unexpectedArgResult = spawnSync('bash', ['scripts/production-preflight.sh', 'unexpected'], {
    cwd: rootDir,
    env: process.env,
    encoding: 'utf8',
    timeout: 5000
  });
  const unexpectedArgOutput = `${unexpectedArgResult.stdout}\n${unexpectedArgResult.stderr}`;
  if (unexpectedArgResult.status === 0 || !/Usage: scripts\/production-preflight\.sh/.test(unexpectedArgOutput)) {
    throw new Error(`production preflight should reject unexpected positional arguments before preflight work:\n${unexpectedArgOutput}`);
  }
  if (/Production preflight failed|ok /.test(unexpectedArgOutput)) {
    throw new Error('production preflight must reject unexpected positional arguments before env, compose, or docker checks.');
  }
  if (!/ALLOW_OPEN_METRICS="\$\{PREFLIGHT_ALLOW_OPEN_METRICS:-0\}"/.test(preflightSource)) {
    throw new Error('production preflight must expose an explicit PREFLIGHT_ALLOW_OPEN_METRICS bypass.');
  }
  if (!/METRICS_TOKEN or METRICS_TOKEN_FILE must be set for production metrics/.test(preflightSource)) {
    throw new Error('production preflight must fail closed when production metrics token is missing.');
  }
  if (!/open_metrics="\$\(get_env ALLOW_OPEN_METRICS\)"/.test(preflightSource) || !/ALLOW_OPEN_METRICS=true and PREFLIGHT_ALLOW_OPEN_METRICS=1/.test(preflightSource)) {
    throw new Error('production preflight must require both runtime and preflight intent before open metrics is allowed.');
  }
  if (!/METRICS_TOKEN must be at least 32 characters/.test(preflightSource) || !/METRICS_TOKEN is still a placeholder/.test(preflightSource)) {
    throw new Error('production preflight must reject weak or placeholder metrics tokens.');
  }
  if (!/METRICS_TOKEN_FILE must be set so production Prometheus can mount the scrape token/.test(preflightSource)) {
    throw new Error('production preflight must require METRICS_TOKEN_FILE for secure Prometheus scraping.');
  }
  if (!/METRICS_TOKEN_FILE must be \/run\/secrets\/metrics_token/.test(preflightSource) || !/AIOSK_SECRETS_DIR/.test(preflightSource)) {
    throw new Error('production preflight must align the host secret directory with the container metrics token path.');
  }
  if (!/^ALLOW_OPEN_METRICS=false$/m.test(productionEnvSource)) {
    throw new Error('.env.production.example must make open metrics an explicit runtime choice.');
  }
  if (!/ALLOW_OPEN_METRICS:\s*\$\{ALLOW_OPEN_METRICS:-false\}/.test(composeSource) || !/ALLOW_OPEN_METRICS:\s*\$\{ALLOW_OPEN_METRICS:-false\}/.test(productionComposeSource)) {
    throw new Error('Compose files must pass ALLOW_OPEN_METRICS through to the backend service.');
  }
  if (!/METRICS_TOKEN_FILE:\s*\$\{METRICS_TOKEN_FILE:-\}/.test(productionComposeSource)) {
    throw new Error('production compose must pass METRICS_TOKEN_FILE through to the backend service.');
  }
  if (!/\.\/monitoring\/prometheus\.secure\.yml:\/etc\/prometheus\/prometheus\.yml:ro/.test(productionComposeSource)) {
    throw new Error('production compose must use the secure Prometheus scrape config.');
  }
  if (!/\$\{AIOSK_SECRETS_DIR:-\/run\/secrets\}:\/run\/secrets:ro/.test(productionComposeSource)) {
    throw new Error('production compose must mount the secret directory for backend and Prometheus token files.');
  }
  if (!/authorization:[\s\S]*type:\s*Bearer[\s\S]*credentials_file:\s*\/run\/secrets\/metrics_token/.test(securePrometheusSource)) {
    throw new Error('production Prometheus config must scrape backend metrics with the metrics token file.');
  }
  if (!/read_env_value METRICS_TOKEN_FILE/.test(deployComposeSource) || !/read_env_value AIOSK_SECRETS_DIR/.test(deployComposeSource) || !/export SMOKE_METRICS_TOKEN="\$ENV_FILE_METRICS_TOKEN"/.test(deployComposeSource)) {
    throw new Error('deploy-compose.sh must pass file-based metrics tokens through to deployment smoke.');
  }
  if (!/read_env_value COMPOSE_BACKEND_PORT/.test(deployComposeSource) || !/SMOKE_BACKEND_PORT="\$\{COMPOSE_BACKEND_PORT:-\$\{ENV_BACKEND_PORT:-3000\}\}"/.test(deployComposeSource)) {
    throw new Error('deploy-compose.sh must derive the default smoke URL port from the deployment env file.');
  }
  if (!/prometheus\.secure\.yml/.test(preflightSource) || !/prometheus secure config/.test(preflightSource)) {
    throw new Error('production preflight must validate the secure Prometheus config.');
  }
  if (
    !/temp_secret_dir="\$\(mktemp -d\)"[\s\S]*prometheus\.secure\.yml[\s\S]*ok "prometheus secure config"[\s\S]*else[\s\S]*rm -rf "\$temp_secret_dir"[\s\S]*fail "prometheus secure config validation failed"[\s\S]*fi[\s\S]*rm -rf "\$temp_secret_dir"/.test(preflightSource)
  ) {
    throw new Error('production preflight must remove temporary monitoring secret directories on secure Prometheus validation failure and success.');
  }
  if (!/METRICS_TOKEN must be set in production, or ALLOW_OPEN_METRICS=true must be set intentionally/.test(serverSource)) {
    throw new Error('server.js must fail closed for production metrics unless ALLOW_OPEN_METRICS=true is explicit.');
  }
  if (
    /getExpectedMetricsToken|getProvidedMetricsToken/.test(healthControllerSource) ||
    !/const crypto = require\('crypto'\);/.test(healthControllerSource) ||
    !/const expectedToken = process\.env\.METRICS_TOKEN \|\| '';/.test(metricsHandlerBlock) ||
    !/const authorization = req\.get\('Authorization'\) \|\| '';/.test(metricsHandlerBlock) ||
    !/const providedToken = authorization\.startsWith\('Bearer '\)\s*\?[\s\S]*authorization\.slice\('Bearer '\.length\)\.trim\(\)[\s\S]*:\s*req\.get\('x-metrics-token'\) \|\| '';/.test(metricsHandlerBlock) ||
    !/const expectedBuffer = Buffer\.from\(expectedToken\);[\s\S]*const providedBuffer = Buffer\.from\(providedToken\);[\s\S]*const tokenIsValid = expectedBuffer\.length === providedBuffer\.length &&[\s\S]*crypto\.timingSafeEqual\(expectedBuffer, providedBuffer\);[\s\S]*if \(!tokenIsValid\)/.test(metricsHandlerBlock) ||
    /providedToken !== expectedToken/.test(metricsHandlerBlock)
  ) {
    throw new Error('Metrics handler must not keep single-use token helper wrappers; getMetrics owns direct METRICS_TOKEN/header parsing and timing-safe token comparison.');
  }
  if (!/PREFLIGHT_ALLOW_OPEN_METRICS=1/.test(`${readmeSource}\n${runbookSource}\n${auditSource}`)) {
    throw new Error('docs must explain the explicit open metrics preflight bypass.');
  }
  if (
    !/Production runtime은 32자 이상의 `METRICS_TOKEN` 또는 `METRICS_TOKEN_FILE`/.test(readmeSource) ||
    !/Production runtime은 32자 이상의 `METRICS_TOKEN` 또는 `METRICS_TOKEN_FILE`/.test(runbookSource) ||
    !/Production runtime도 `METRICS_TOKEN`, `METRICS_TOKEN_FILE`, 또는 `ALLOW_OPEN_METRICS=true`/.test(auditSource)
  ) {
    throw new Error('docs must keep production runtime metrics token wording aligned with METRICS_TOKEN_FILE support.');
  }
  if (!/Operational verification entrypoints reject positional arguments before preflight or network work/.test(`${readmeSource}\n${runbookSource}\n${auditSource}`)) {
    throw new Error('docs must record that operational verification entrypoints reject unexpected positional arguments before preflight or network work.');
  }
  if (!/ALLOW_OPEN_METRICS=true/.test(`${readmeSource}\n${runbookSource}\n${auditSource}`)) {
    throw new Error('docs must explain the explicit open metrics runtime bypass.');
  }
  if (
    /const normalizeRoute\s*=|const getSeries\s*=|const observeHttpRequest\s*=|normalizeRoute\(req\)|observeHttpRequest\(/.test(metricsSource) ||
    !/res\.on\('finish', \(\) => \{[\s\S]*const route = req\.route && req\.route\.path[\s\S]*const statusClass = `\$\{Math\.floor\(res\.statusCode \/ 100\)\}xx`;[\s\S]*const key = \[req\.method, route, statusClass\]\.join\('\|'\);[\s\S]*httpSeries\.set\(key, \{[\s\S]*buckets: HTTP_DURATION_BUCKETS_SECONDS\.map\(\(\) => 0\)[\s\S]*series\.count \+= 1;[\s\S]*series\.buckets\[index\] \+= 1;/.test(metricsSource)
  ) {
    throw new Error('metricsMiddleware must record HTTP metrics inline without single-use normalizeRoute/getSeries/observeHttpRequest wrappers.');
  }
  if (
    /const escapeLabel\s*=|escapeLabel\(/.test(metricsSource) ||
    !/String\(value\)/.test(metricsLabelSetBlock) ||
    (metricsLabelSetBlock.match(/\.replace\(/g) || []).length !== 3
  ) {
    throw new Error('metrics labelSet must inline Prometheus label escaping without a single-use escapeLabel helper.');
  }
  if (
    /const renderProcessMetrics\s*=|const renderHttpMetrics\s*=|renderProcessMetrics\(|renderHttpMetrics\(/.test(metricsSource) ||
    !/const renderPrometheusMetrics = \(\) => \{[\s\S]*const memory = process\.memoryUsage\(\);[\s\S]*aiosk_process_uptime_seconds[\s\S]*Object\.entries\(memory\)\.forEach[\s\S]*aiosk_process_memory_bytes[\s\S]*lines\.push\([\s\S]*aiosk_http_requests_total[\s\S]*Array\.from\(httpSeries\.values\(\)\)[\s\S]*aiosk_http_request_duration_seconds_count[\s\S]*return lines\.join\('\\n'\) \+ '\\n';[\s\S]*\};/.test(metricsSource)
  ) {
    throw new Error('renderPrometheusMetrics must inline process and HTTP metric rendering without single-use render helpers.');
  }
  if (!/metrics token(?: file)? 누락/.test(readmeSource) || !/metrics token(?: file)? 누락/.test(runbookSource)) {
    throw new Error('README and runbook must document metrics token missing as a production preflight failure.');
  }

  console.log('ok metrics preflight contract');
};

const verifyHeartbeatSoakContract = () => {
  const heartbeatSoakSource = fs.readFileSync(path.join(rootDir, 'scripts/heartbeat-soak.js'), 'utf8');
  const auditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const runbookSource = fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8');

  if (!/process\.argv\.length > 2/.test(heartbeatSoakSource) || !/Usage: scripts\/heartbeat-soak\.js/.test(heartbeatSoakSource)) {
    throw new Error('heartbeat soak must reject unexpected positional arguments before network work.');
  }
  const unexpectedArgResult = spawnSync(process.execPath, ['scripts/heartbeat-soak.js', 'unexpected'], {
    cwd: rootDir,
    env: process.env,
    encoding: 'utf8',
    timeout: 5000
  });
  const unexpectedArgOutput = `${unexpectedArgResult.stdout}\n${unexpectedArgResult.stderr}`;
  if (unexpectedArgResult.status === 0 || !/Usage: scripts\/heartbeat-soak\.js/.test(unexpectedArgOutput)) {
    throw new Error(`heartbeat soak should reject unexpected positional arguments before network work:\n${unexpectedArgOutput}`);
  }
  if (/running heartbeat soak against/.test(unexpectedArgOutput)) {
    throw new Error('heartbeat soak must reject unexpected positional arguments before starting soak requests.');
  }
  if (
    /const buildUrl\s*=|buildUrl\(/.test(heartbeatSoakSource) ||
    !heartbeatSoakSource.includes('response = await fetch(new URL(route, `${config.baseUrl}/`).toString(), {')
  ) {
    throw new Error('heartbeat soak must inline request URL construction without a single-use buildUrl helper.');
  }
  if (
    /const assertExpectedStatus\s*=|assertExpectedStatus\(/.test(heartbeatSoakSource) ||
    !/const text = await response\.text\(\);\s*if \(options\.status !== undefined\) \{\s*const expected = Array\.isArray\(options\.status\) \? options\.status : \[options\.status\];\s*if \(!expected\.includes\(response\.status\)\) \{[\s\S]*expected HTTP \$\{expected\.join\(' or '\)\}, got \$\{response\.status\}: \$\{text\.slice\(0, 400\)\}/.test(heartbeatSoakSource)
  ) {
    throw new Error('heartbeat soak must inline expected HTTP status validation without a single-use assertExpectedStatus helper.');
  }
  if (
    /const sleep\s*=|sleep\(/.test(heartbeatSoakSource) ||
    !/await new Promise\(\(resolve\) => setTimeout\(resolve, Math\.min\(config\.intervalMs, remainingMs\)\)\);/.test(heartbeatSoakSource)
  ) {
    throw new Error('heartbeat soak must inline the single-use sleep helper at the remaining interval wait point.');
  }
  if (
    /const normalizeBaseUrl\s*=|normalizeBaseUrl\(/.test(heartbeatSoakSource) ||
    !/const rawBaseUrl = \(process\.env\.SOAK_BASE_URL \|\| process\.env\.SMOKE_BASE_URL \|\| process\.env\.BASE_URL \|\| ''\)\.trim\(\) \|\| DEFAULT_BASE_URL;\s*const parsedBaseUrl = new URL\(rawBaseUrl\);\s*if \(!\['http:', 'https:'\]\.includes\(parsedBaseUrl\.protocol\)\) \{[\s\S]*SOAK_BASE_URL must use http or https, got: \$\{rawBaseUrl\}/.test(heartbeatSoakSource) ||
    !/baseUrl:\s*parsedBaseUrl\.toString\(\)\.replace\(\/\\\/\$\/, ''\),/.test(heartbeatSoakSource)
  ) {
    throw new Error('heartbeat soak must inline base URL normalization without a single-use normalizeBaseUrl helper.');
  }
  if (!/heartbeat-soak\.js`의 `buildUrl\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the heartbeat soak buildUrl helper removal.');
  }
  if (!/heartbeat-soak\.js`의 `assertExpectedStatus\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the heartbeat soak assertExpectedStatus helper removal.');
  }
  if (!/heartbeat-soak\.js`의 `sleep\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the heartbeat soak sleep helper removal.');
  }
  if (!/heartbeat-soak\.js`의 `normalizeBaseUrl\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the heartbeat soak normalizeBaseUrl helper removal.');
  }
  if (
    /Number\.isFinite\(parsed\) && parsed > 0/.test(heartbeatSoakSource) ||
    !/const parsePositiveInt = \(value, fallback, envName\) => \{[\s\S]*if \(value === undefined \|\| value === ''\) return fallback;[\s\S]*const text = typeof value === 'number'[\s\S]*\(typeof value === 'string' \? value\.trim\(\) : ''\);[\s\S]*const parsed = \/\^\[1-9\]\[0-9\]\*\$\/\.test\(text\) \? Number\(text\) : null;[\s\S]*throw new Error\(`\$\{envName\} must be a positive integer\.`\);[\s\S]*return parsed;[\s\S]*\};/.test(heartbeatSoakSource) ||
    !/durationMs: parsePositiveInt\(process\.env\.SOAK_DURATION_MS, DEFAULT_DURATION_MS, 'SOAK_DURATION_MS'\)/.test(heartbeatSoakSource) ||
    !/intervalMs: parsePositiveInt\(process\.env\.SOAK_INTERVAL_MS, DEFAULT_INTERVAL_MS, 'SOAK_INTERVAL_MS'\)/.test(heartbeatSoakSource) ||
    !/timeoutMs: parsePositiveInt\(process\.env\.SOAK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 'SOAK_TIMEOUT_MS'\)/.test(heartbeatSoakSource) ||
    !/SOAK_MAX_AGE_SECONDS'/.test(heartbeatSoakSource)
  ) {
    throw new Error('heartbeat soak numeric env values must be strict positive integers instead of silently falling back.');
  }
  if (
    !/SOAK_KIOSK_ID/.test(runbookSource) ||
    !/SOAK_KIOSK_LABEL/.test(runbookSource) ||
    !/SOAK_APP_VERSION/.test(runbookSource) ||
    !/SOAK_TIMEOUT_MS/.test(runbookSource) ||
    !/SOAK_MAX_AGE_SECONDS/.test(runbookSource)
  ) {
    throw new Error('OPERATIONS_RUNBOOK.md must document heartbeat soak kiosk identity, label, app version, timeout, and max-age env knobs.');
  }
  if (
    !/Heartbeat soak base URL 우선순위는 `SOAK_BASE_URL`, `SMOKE_BASE_URL`, 공통 `BASE_URL`, local default 순서다/.test(runbookSource) ||
    !/Soak admin credential 우선순위는 `SOAK_ADMIN_USERNAME`\/`SOAK_ADMIN_PASSWORD`, `SMOKE_ADMIN_USERNAME`\/`SMOKE_ADMIN_PASSWORD`, 공통 `ADMIN_USERNAME`\/`ADMIN_PASSWORD` 순서다/.test(runbookSource) ||
    !/상위 tier의 partial pair는 하위 tier 값과 섞지 않고 네트워크 요청 전에 실패한다/.test(`${runbookSource}\n${readmeSource}`) ||
    !/Soak admin credential은 `SOAK_ADMIN_USERNAME`\/`SOAK_ADMIN_PASSWORD`, `SMOKE_ADMIN_USERNAME`\/`SMOKE_ADMIN_PASSWORD`, `ADMIN_USERNAME`\/`ADMIN_PASSWORD` 순서로 complete pair만 선택/.test(readmeSource)
  ) {
    throw new Error('OPERATIONS_RUNBOOK.md must document heartbeat soak base URL and admin credential fallback env priority.');
  }
  if (
    !/\['SOAK_ADMIN_USERNAME', 'SOAK_ADMIN_PASSWORD'\][\s\S]*\['SMOKE_ADMIN_USERNAME', 'SMOKE_ADMIN_PASSWORD'\][\s\S]*\['ADMIN_USERNAME', 'ADMIN_PASSWORD'\]/.test(heartbeatSoakSource) ||
    !/Set both \$\{usernameEnvName\} and \$\{passwordEnvName\}, or unset both to fall back\./.test(heartbeatSoakSource) ||
    !/adminUsername,\s*adminPassword,/.test(heartbeatSoakSource)
  ) {
    throw new Error('heartbeat soak credential fallback must select complete env pairs and reject partial higher-priority pairs before network work.');
  }
  const adminCredentialMismatchResult = spawnSync(process.execPath, ['scripts/heartbeat-soak.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      SOAK_ADMIN_USERNAME: '',
      SOAK_ADMIN_PASSWORD: '',
      SMOKE_ADMIN_USERNAME: 'smoke_admin',
      SMOKE_ADMIN_PASSWORD: '',
      ADMIN_USERNAME: '',
      ADMIN_PASSWORD: 'admin_password'
    },
    encoding: 'utf8',
    timeout: 5000
  });
  if (
    adminCredentialMismatchResult.status === 0 ||
    !`${adminCredentialMismatchResult.stdout}\n${adminCredentialMismatchResult.stderr}`.includes('Set both SMOKE_ADMIN_USERNAME and SMOKE_ADMIN_PASSWORD, or unset both to fall back.') ||
    `${adminCredentialMismatchResult.stdout}\n${adminCredentialMismatchResult.stderr}`.includes('running heartbeat soak against')
  ) {
    throw new Error(`heartbeat soak should reject partial higher-priority admin credential pairs before falling back or networking:\n${adminCredentialMismatchResult.stdout}\n${adminCredentialMismatchResult.stderr}`);
  }
  if (!/Ops smoke\/soak fallback env contract/.test(auditSource) || !/complete pair priority/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the ops smoke/soak fallback env contract.');
  }

  console.log('ok heartbeat soak contract');
};

const verifyDeploymentSmokeContract = () => {
  const opsSmokeSource = fs.readFileSync(path.join(rootDir, 'scripts/ops-smoke.js'), 'utf8');
  const auditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const operationsRunbookSource = fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8');

  if (!/process\.argv\.length > 2/.test(opsSmokeSource) || !/Usage: scripts\/ops-smoke\.js/.test(opsSmokeSource)) {
    throw new Error('deployment smoke must reject unexpected positional arguments before network work.');
  }
  const unexpectedArgResult = spawnSync(process.execPath, ['scripts/ops-smoke.js', 'unexpected'], {
    cwd: rootDir,
    env: process.env,
    encoding: 'utf8',
    timeout: 5000
  });
  const unexpectedArgOutput = `${unexpectedArgResult.stdout}\n${unexpectedArgResult.stderr}`;
  if (unexpectedArgResult.status === 0 || !/Usage: scripts\/ops-smoke\.js/.test(unexpectedArgOutput)) {
    throw new Error(`deployment smoke should reject unexpected positional arguments before network work:\n${unexpectedArgOutput}`);
  }
  if (/running deployment smoke against/.test(unexpectedArgOutput)) {
    throw new Error('deployment smoke must reject unexpected positional arguments before starting smoke requests.');
  }
  if (
    /const buildUrl\s*=|buildUrl\(/.test(opsSmokeSource) ||
    !opsSmokeSource.includes('response = await fetch(new URL(route, `${config.baseUrl}/`).toString(), {')
  ) {
    throw new Error('deployment smoke must inline request URL construction without a single-use buildUrl helper.');
  }
  if (
    /const normalizeBaseUrl\s*=|normalizeBaseUrl\(/.test(opsSmokeSource) ||
    !/const rawBaseUrl = \(process\.env\.SMOKE_BASE_URL \|\| process\.env\.BASE_URL \|\| ''\)\.trim\(\) \|\| 'http:\/\/127\.0\.0\.1:3000';\s*const parsedBaseUrl = new URL\(rawBaseUrl\);\s*if \(!\['http:', 'https:'\]\.includes\(parsedBaseUrl\.protocol\)\) \{[\s\S]*SMOKE_BASE_URL must use http or https, got: \$\{rawBaseUrl\}/.test(opsSmokeSource) ||
    !/baseUrl:\s*parsedBaseUrl\.toString\(\)\.replace\(\/\\\/\$\/, ''\),/.test(opsSmokeSource)
  ) {
    throw new Error('deployment smoke must inline base URL normalization without a single-use normalizeBaseUrl helper.');
  }
  if (
    /const getCookieHeader\s*=|getCookieHeader\(/.test(opsSmokeSource) ||
    !/cookie:\s*typeof response\.headers\.getSetCookie === 'function'\s*\?\s*response\.headers\.getSetCookie\(\)\s*\.map\(cookie => cookie\.split\(';'\)\[0\]\)\s*\.join\('; '\)\s*:\s*\(response\.headers\.get\('set-cookie'\) \? response\.headers\.get\('set-cookie'\)\.split\(';'\)\[0\] : ''\),/.test(opsSmokeSource)
  ) {
    throw new Error('deployment smoke must inline session cookie extraction without a single-use getCookieHeader helper.');
  }
  if (
    /const assertExpectedStatus\s*=|assertExpectedStatus\(/.test(opsSmokeSource) ||
    !/if \(options\.status !== undefined\) \{\s*const expected = Array\.isArray\(options\.status\) \? options\.status : \[options\.status\];\s*if \(!expected\.includes\(response\.status\)\) \{[\s\S]*expected HTTP \$\{expected\.join\(' or '\)\}, got \$\{response\.status\}/.test(opsSmokeSource) ||
    !/const expectedMetricsStatus = config\.metricsToken \? 200 : \[200, 403\];\s*const metrics = await request\('GET', '\/metrics', \{ headers, status: expectedMetricsStatus \}\);/.test(opsSmokeSource)
  ) {
    throw new Error('deployment smoke must inline expected HTTP status validation in request() without an assertExpectedStatus helper.');
  }
  if (
    /const parsePositiveInt\s*=|parsePositiveInt\(/.test(opsSmokeSource) ||
    /Number\(process\.env\.SMOKE_TIMEOUT_MS\)|Number\.isFinite\(parsedTimeoutMs\)/.test(opsSmokeSource) ||
    !/let timeoutMs = DEFAULT_TIMEOUT_MS;[\s\S]*const rawTimeoutMs = process\.env\.SMOKE_TIMEOUT_MS;[\s\S]*if \(rawTimeoutMs !== undefined && rawTimeoutMs !== ''\) \{[\s\S]*const timeoutText = typeof rawTimeoutMs === 'number'[\s\S]*\(typeof rawTimeoutMs === 'string' \? rawTimeoutMs\.trim\(\) : ''\);[\s\S]*const parsedTimeoutMs = \/\^\[1-9\]\[0-9\]\*\$\/\.test\(timeoutText\) \? Number\(timeoutText\) : null;[\s\S]*SMOKE_TIMEOUT_MS must be a positive integer\.[\s\S]*timeoutMs = parsedTimeoutMs;[\s\S]*timeoutMs,/.test(opsSmokeSource)
  ) {
    throw new Error('deployment smoke must inline strict SMOKE_TIMEOUT_MS normalization without a single-use parsePositiveInt helper or silent fallback.');
  }
  if (
    !/각 HTTP 요청 timeout은 기본 `10000ms`이며 느린 환경에서는 `SMOKE_TIMEOUT_MS`/.test(operationsRunbookSource) ||
    !/positive integer millisecond/.test(operationsRunbookSource) ||
    !/잘못된 값은 네트워크 요청 전에 실패한다/.test(operationsRunbookSource)
  ) {
    throw new Error('OPERATIONS_RUNBOOK.md must document the SMOKE_TIMEOUT_MS deployment smoke timeout contract.');
  }
  if (
    !/Smoke base URL 우선순위는 `SMOKE_BASE_URL`, 공통 `BASE_URL`, local default 순서다/.test(operationsRunbookSource) ||
    !/Smoke admin credential 우선순위는 `SMOKE_ADMIN_USERNAME`\/`SMOKE_ADMIN_PASSWORD`, 공통 `ADMIN_USERNAME`\/`ADMIN_PASSWORD` 순서다/.test(operationsRunbookSource) ||
    !/상위 tier의 partial pair는 하위 tier 값과 섞지 않고 네트워크 요청 전에 실패합니다/.test(readmeSource) ||
    !/상위 tier의 partial pair는 하위 tier 값과 섞지 않고 네트워크 요청 전에 실패한다/.test(operationsRunbookSource) ||
    !/Smoke admin credential은 `SMOKE_ADMIN_USERNAME`\/`SMOKE_ADMIN_PASSWORD`, `ADMIN_USERNAME`\/`ADMIN_PASSWORD` 순서로 complete pair만 선택/.test(readmeSource)
  ) {
    throw new Error('OPERATIONS_RUNBOOK.md must document deployment smoke base URL and admin credential fallback env priority.');
  }
  if (
    !/\['SMOKE_ADMIN_USERNAME', 'SMOKE_ADMIN_PASSWORD'\][\s\S]*\['ADMIN_USERNAME', 'ADMIN_PASSWORD'\]/.test(opsSmokeSource) ||
    !/Set both \$\{usernameEnvName\} and \$\{passwordEnvName\}, or unset both to fall back\./.test(opsSmokeSource) ||
    !/adminUsername,\s*adminPassword,/.test(opsSmokeSource) ||
    !/SMOKE_RUN_WRITE=1 requires SMOKE_ADMIN_USERNAME\/SMOKE_ADMIN_PASSWORD or ADMIN_USERNAME\/ADMIN_PASSWORD\./.test(opsSmokeSource) ||
    !/set SMOKE_ADMIN_USERNAME\/SMOKE_ADMIN_PASSWORD or ADMIN_USERNAME\/ADMIN_PASSWORD to enable it/.test(opsSmokeSource)
  ) {
    throw new Error('deployment smoke credential fallback must select complete env pairs and reject partial higher-priority pairs before network work.');
  }
  const adminCredentialMismatchResult = spawnSync(process.execPath, ['scripts/ops-smoke.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      SMOKE_ADMIN_USERNAME: 'smoke_admin',
      SMOKE_ADMIN_PASSWORD: '',
      ADMIN_USERNAME: '',
      ADMIN_PASSWORD: 'admin_password',
      SMOKE_RUN_WRITE: ''
    },
    encoding: 'utf8',
    timeout: 5000
  });
  if (
    adminCredentialMismatchResult.status === 0 ||
    !`${adminCredentialMismatchResult.stdout}\n${adminCredentialMismatchResult.stderr}`.includes('Set both SMOKE_ADMIN_USERNAME and SMOKE_ADMIN_PASSWORD, or unset both to fall back.') ||
    `${adminCredentialMismatchResult.stdout}\n${adminCredentialMismatchResult.stderr}`.includes('running deployment smoke against')
  ) {
    throw new Error(`deployment smoke should reject partial higher-priority admin credential pairs before falling back or networking:\n${adminCredentialMismatchResult.stdout}\n${adminCredentialMismatchResult.stderr}`);
  }
  const writeWithoutAdminResult = spawnSync(process.execPath, ['scripts/ops-smoke.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      SMOKE_ADMIN_USERNAME: '',
      SMOKE_ADMIN_PASSWORD: '',
      ADMIN_USERNAME: '',
      ADMIN_PASSWORD: '',
      SMOKE_RUN_WRITE: '1'
    },
    encoding: 'utf8',
    timeout: 5000
  });
  if (
    writeWithoutAdminResult.status === 0 ||
    !`${writeWithoutAdminResult.stdout}\n${writeWithoutAdminResult.stderr}`.includes('SMOKE_RUN_WRITE=1 requires SMOKE_ADMIN_USERNAME/SMOKE_ADMIN_PASSWORD or ADMIN_USERNAME/ADMIN_PASSWORD.')
  ) {
    throw new Error(`deployment smoke should report both admin credential fallback env pairs when write smoke lacks credentials:\n${writeWithoutAdminResult.stdout}\n${writeWithoutAdminResult.stderr}`);
  }
  if (
    /운영 preflight는 기본적으로 32자 이상의 metrics token을 요구한다/.test(operationsRunbookSource) ||
    !/`npm run ops:smoke`를 직접 실행할 때 protected `\/metrics` 검증에는 `SMOKE_METRICS_TOKEN` 또는 `METRICS_TOKEN`을 전달한다/.test(operationsRunbookSource) ||
    !/`RUN_SMOKE=1` 배포 smoke는 env의 `METRICS_TOKEN` 또는 file-backed metrics token을 자동 전달한다/.test(operationsRunbookSource) ||
    !/Protected `\/metrics`를 수동 smoke에서 검증하려면 `SMOKE_METRICS_TOKEN` 또는 `METRICS_TOKEN`을 전달/.test(readmeSource) ||
    !/`RUN_SMOKE=1` 배포 smoke는 배포 env 파일의 `METRICS_TOKEN` 또는 file-backed metrics token을 자동 전달/.test(readmeSource) ||
    !/`RUN_SMOKE=1`은 `SMOKE_METRICS_TOKEN`이 없으면 배포 env 파일의 `METRICS_TOKEN`/.test(readmeSource) ||
    !/README와 운영 런북의 수동 `npm run ops:smoke` 안내도 직접 smoke는 `SMOKE_METRICS_TOKEN`\/`METRICS_TOKEN`/.test(auditSource)
  ) {
    throw new Error('Deployment smoke docs must distinguish direct smoke metrics tokens from RUN_SMOKE file-backed token forwarding.');
  }
  if (!/SMOKE_TIMEOUT_MS runbook contract/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the SMOKE_TIMEOUT_MS runbook contract.');
  }
  if (!/Ops smoke\/soak fallback env contract/.test(auditSource) || !/complete pair priority/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the ops smoke/soak fallback env contract.');
  }
  if (
    /const boolEnv\s*=|boolEnv\(/.test(opsSmokeSource) ||
    !/\['SMOKE_RUN_WRITE', 'SMOKE_SKIP_ADMIN_SESSION'\]\.forEach\(\(envName\) => \{[\s\S]*!\['0', '1', 'true', 'false'\]\.includes\(value\)[\s\S]*throw new Error\(`\$\{envName\} must be 0, 1, true, or false\.`\);[\s\S]*\}\);/.test(opsSmokeSource) ||
    !/runWrite:\s*process\.env\.SMOKE_RUN_WRITE === '1' \|\| process\.env\.SMOKE_RUN_WRITE === 'true'/.test(opsSmokeSource) ||
    !/skipAdminSession:\s*process\.env\.SMOKE_SKIP_ADMIN_SESSION === '1' \|\| process\.env\.SMOKE_SKIP_ADMIN_SESSION === 'true'/.test(opsSmokeSource)
  ) {
    throw new Error('deployment smoke must validate and inline the local SMOKE_* boolean flag parsing instead of keeping a boolEnv wrapper.');
  }
  if (
    !/const sessionLoginPage = await request\('GET', '\/admin\/login', \{ status: 200 \}\);[\s\S]*const csrfTokenMatch = sessionLoginPage\.text\.match\(/.test(opsSmokeSource) ||
    !/assert\.ok\(csrfTokenMatch, 'admin HTML should include a CSRF token'\);[\s\S]*const csrfToken = csrfTokenMatch\[1\];[\s\S]*cookie:\s*sessionLoginPage\.cookie,[\s\S]*_csrf:\s*csrfToken/.test(opsSmokeSource) ||
    !/const logoutResponse = await request\('POST', '\/admin\/logout'[\s\S]*_csrf:\s*csrfToken[\s\S]*const postLogoutDashboard = await request\('GET', '\/admin'/.test(opsSmokeSource)
  ) {
    throw new Error('deployment smoke admin session check must fetch and submit CSRF tokens for login/logout.');
  }
  [
    ['SMOKE_RUN_WRITE', 'yes'],
    ['SMOKE_SKIP_ADMIN_SESSION', 'maybe']
  ].forEach(([envName, value]) => {
    const result = spawnSync(process.execPath, ['scripts/ops-smoke.js'], {
      cwd: rootDir,
      env: {
        ...process.env,
        [envName]: value
      },
      encoding: 'utf8',
      timeout: 5000
    });

    if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes(`${envName} must be 0, 1, true, or false.`)) {
      throw new Error(`deployment smoke must reject invalid ${envName} before network calls.`);
    }
    if (/running deployment smoke against/.test(`${result.stdout}\n${result.stderr}`)) {
      throw new Error(`deployment smoke must reject invalid ${envName} before starting smoke requests.`);
    }
  });
  if (!/ops-smoke\.js`의 `buildUrl\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the ops smoke buildUrl helper removal.');
  }
  if (!/ops-smoke\.js`의 `normalizeBaseUrl\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the ops smoke normalizeBaseUrl helper removal.');
  }
  if (!/ops-smoke\.js`의 `getCookieHeader\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the ops smoke getCookieHeader helper removal.');
  }
  if (!/ops-smoke\.js`의 `assertExpectedStatus\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the ops smoke assertExpectedStatus helper removal.');
  }
  if (!/ops-smoke\.js`의 `parsePositiveInt\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the ops smoke parsePositiveInt helper removal.');
  }
  if (!/ops-smoke\.js`의 `boolEnv\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the ops smoke boolEnv helper removal.');
  }

  console.log('ok deployment smoke contract');
};

const verifySwaggerServerUrlContract = () => {
  const swaggerSource = fs.readFileSync(path.join(rootDir, 'src/config/swagger.config.js'), 'utf8');
  const composeSource = fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8');
  const productionComposeSource = fs.readFileSync(path.join(rootDir, 'docker-compose.prod.yml'), 'utf8');
  const rootEnvExampleSource = fs.readFileSync(path.join(rootDir, '.env.example'), 'utf8');
  const dockerEnvExampleSource = fs.readFileSync(path.join(rootDir, '.env.docker.example'), 'utf8');
  const productionEnvExampleSource = fs.readFileSync(path.join(rootDir, '.env.production.example'), 'utf8');

  if (/url:\s*['"]http:\/\/localhost:3000['"]/.test(swaggerSource)) {
    throw new Error('Swagger/OpenAPI servers.url must not be hard-coded to localhost.');
  }
  if (!/process\.env\.API_PUBLIC_URL\?\.trim\(\)/.test(swaggerSource) || !/configuredApiPublicUrl \|\| ['"]\/['"]/.test(swaggerSource)) {
    throw new Error('Swagger/OpenAPI servers.url must use API_PUBLIC_URL or current origin.');
  }
  if (!/API_PUBLIC_URL:\s*\$\{API_PUBLIC_URL:-\}/.test(composeSource) || !/API_PUBLIC_URL:\s*\$\{API_PUBLIC_URL:-\}/.test(productionComposeSource)) {
    throw new Error('Compose files must pass API_PUBLIC_URL through to the backend service.');
  }
  [
    ['.env.example', rootEnvExampleSource],
    ['.env.docker.example', dockerEnvExampleSource],
    ['.env.production.example', productionEnvExampleSource]
  ].forEach(([fileName, source]) => {
    if (!/^# API_PUBLIC_URL=https:\/\/api\.example\.com$/m.test(source)) {
      throw new Error(`${fileName} must document the optional API_PUBLIC_URL Swagger/OpenAPI server URL env.`);
    }
  });

  console.log('ok swagger server URL contract');
};

const verifyAdminLoginOpenApiContract = () => {
  const adminRoutesSource = fs.readFileSync(path.join(rootDir, 'src/routes/admin.routes.js'), 'utf8');
  const adminControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/admin.controller.js'), 'utf8');

  if (!/message:\s*"Login successful"/.test(adminControllerSource) || !/data:\s*\{[\s\S]*token:\s*token/.test(adminControllerSource)) {
    throw new Error('Admin login controller contract must return message and data.token.');
  }
  if (!/example:\s*"Login successful"/.test(adminRoutesSource) || !/^\s*\*\s+data:\s*$/m.test(adminRoutesSource) || !/^\s*\*\s+token:\s*$/m.test(adminRoutesSource)) {
    throw new Error('OpenAPI admin login 200 response must document message and data.token.');
  }
  if (/^\s*\*\s+success:/m.test(adminRoutesSource) || /^\s*\*\s+admin:/m.test(adminRoutesSource) || /^ \*                 token:\s*$/m.test(adminRoutesSource)) {
    throw new Error('OpenAPI admin login response must not document stale success/admin/top-level token fields.');
  }
  if (!/message:\s*"Username and password are required!"/.test(adminControllerSource) || !/message:\s*"Invalid username or password\."/.test(adminControllerSource)) {
    throw new Error('Admin login controller error messages changed without verifier update.');
  }
  if (!/message:\s*"Username and password are required!"/.test(adminRoutesSource) || !/message:\s*"Invalid username or password\."/.test(adminRoutesSource)) {
    throw new Error('OpenAPI admin login error examples must match controller responses.');
  }

  console.log('ok admin login OpenAPI contract');
};

const verifyAdminMenuOpenApiContract = () => {
  const swaggerSource = fs.readFileSync(path.join(rootDir, 'src/config/swagger.config.js'), 'utf8');
  const menuRoutesSource = fs.readFileSync(path.join(rootDir, 'src/routes/menu.routes.js'), 'utf8');
  const menuControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/menu.controller.js'), 'utf8');
  const menuModelSource = fs.readFileSync(path.join(rootDir, 'src/models/menu.model.js'), 'utf8');
  const schemasBlock = (swaggerSource.match(/schemas:\s*\{[\s\S]*?\n    \},\n  \},\n  tags:/) || [''])[0];
  const schemaNames = Array.from(schemasBlock.matchAll(/^\s{6}([A-Za-z0-9_]+): \{$/gm)).map(match => match[1]);
  const allowedSchemas = new Set(['ErrorResponse', 'Menu', 'Statistics']);

  schemaNames.forEach((schemaName) => {
    if (!allowedSchemas.has(schemaName)) {
      throw new Error(`swagger.config.js contains an unreferenced or stale component schema: ${schemaName}`);
    }
  });
  if (!/const MENU_STATUSES = \['FOR_SALE', 'SOLD_OUT'\];/.test(menuControllerSource) || !/const MENU_STATUSES = \['FOR_SALE', 'SOLD_OUT'\];/.test(menuModelSource)) {
    throw new Error('Admin menu controller/model contract must use status.');
  }
  if (
    /parseInt\(req\.(?:params|query)|parseInt\(category_id|isNaN\(id\)|isNaN\(menuId\)/.test(menuControllerSource) ||
    !/const parsePositiveInteger = \(value\) => \{[\s\S]*\/\^\[1-9\]\[0-9\]\*\$\/\.test\(text\) \? Number\(text\) : null;[\s\S]*return Number\.isSafeInteger\(parsed\) \? parsed : null;[\s\S]*\};/.test(menuControllerSource) ||
    !/const parsedCategoryId = parsePositiveInteger\(category_id\);[\s\S]*Invalid category_id format/.test(menuControllerSource) ||
    !/const id = parsePositiveInteger\(req\.params\.id\);[\s\S]*Invalid Menu ID format/.test(menuControllerSource) ||
    !/const menuId = parsePositiveInteger\(req\.params\.menuId\);[\s\S]*유효하지 않은 메뉴 ID입니다/.test(menuControllerSource)
  ) {
    throw new Error('Admin menu controller must strictly normalize positive integer IDs and category filters.');
  }
  const menuControllerHasStrictPayload = [
    !/parseFloat\(req\.body\.price\)|Number\.parseFloat\(req\.body\.price\)/.test(menuControllerSource),
    !/String\(req\.body\.status\)\.trim\(\)|String\(value \|\| ''\)\.trim\(\)/.test(menuControllerSource),
    menuControllerSource.includes("const parsed = /^(0|[1-9][0-9]*)(\\.[0-9]+)?$/.test(text) ? Number(text) : null;"),
    /const normalizeRequiredText = \(value\) => \{[\s\S]*if \(typeof value !== 'string'\) return null;[\s\S]*const text = value\.trim\(\);[\s\S]*return text \? text : null;[\s\S]*\};/.test(menuControllerSource),
    /const parseMenuStatus = \(value, allowDefault\) => \{[\s\S]*if \(value === undefined \|\| \(allowDefault && value === ''\)\) return undefined;[\s\S]*if \(typeof value !== 'string'\) return null;[\s\S]*MENU_STATUSES\.includes\(status\) \? status : null;[\s\S]*\};/.test(menuControllerSource),
    /const name = normalizeRequiredText\(req\.body\.name\);[\s\S]*req\.body\.category_id === undefined \|\| req\.body\.category_id === ''/.test(menuControllerSource),
    /const price = parseNonNegativePrice\(req\.body\.price\);[\s\S]*Price must be a non-negative number/.test(menuControllerSource),
    /const categoryId = parsePositiveInteger\(req\.body\.category_id\);[\s\S]*Invalid category_id format/.test(menuControllerSource),
    /const status = parseMenuStatus\(req\.body\.status, true\);[\s\S]*if \(status === null\) \{[\s\S]*Invalid menu status/.test(menuControllerSource),
    /price,[\s\S]*category_id:\s*categoryId,[\s\S]*status \/\/ Model handles default if undefined/.test(menuControllerSource),
    /const normalizedStatus = parseMenuStatus\(status, false\);[\s\S]*Invalid menu status[\s\S]*filters\.status = normalizedStatus;/.test(menuControllerSource),
    /if \(req\.body\.price !== undefined\) \{[\s\S]*const price = parseNonNegativePrice\(req\.body\.price\);[\s\S]*Price must be a non-negative number[\s\S]*menuDataToUpdate\.price = price;/.test(menuControllerSource),
    /if \(req\.body\.status !== undefined\) \{[\s\S]*const status = parseMenuStatus\(req\.body\.status, false\);[\s\S]*if \(status === null\) \{[\s\S]*Invalid menu status[\s\S]*menuDataToUpdate\.status = status;/.test(menuControllerSource)
  ].every(Boolean);
  if (!menuControllerHasStrictPayload) {
    throw new Error('Admin menu controller must strictly normalize price/category/status payloads.');
  }
  const menuModelValidatesWrites = [
    /const parsePositiveInteger = \(value\) => \{[\s\S]*typeof value === 'number'[\s\S]*typeof value === 'string' \? value\.trim\(\) : ''[\s\S]*return Number\.isSafeInteger\(parsed\) \? parsed : null;[\s\S]*\};/.test(menuModelSource),
    /const parseNonNegativePrice = \(value\) => \{[\s\S]*typeof value === 'number'[\s\S]*Number\.isFinite\(value\) && value >= 0[\s\S]*typeof value === 'string' \? value\.trim\(\) : ''[\s\S]*\};/.test(menuModelSource),
    /const normalizeRequiredText = \(value, fieldName\) => \{[\s\S]*typeof value !== 'string'[\s\S]*\$\{fieldName\} must be a non-empty string\.[\s\S]*return text;[\s\S]*\};/.test(menuModelSource),
    /const normalizeStatus = \(value, useDefault\) => \{[\s\S]*return useDefault \? 'FOR_SALE' : undefined;[\s\S]*status must be one of: FOR_SALE, SOLD_OUT[\s\S]*MENU_STATUSES\.includes\(status\)[\s\S]*return status;[\s\S]*\};/.test(menuModelSource),
    /const categoryId = parsePositiveInteger\(newMenu\.category_id\);[\s\S]*category_id must be a positive integer[\s\S]*const price = parseNonNegativePrice\(newMenu\.price\);[\s\S]*price must be a non-negative number[\s\S]*name: normalizeRequiredText\(newMenu\.name, 'name'\),[\s\S]*status: normalizeStatus\(newMenu\.status, true\)/.test(menuModelSource),
    /const normalizedId = parsePositiveInteger\(id\);[\s\S]*if \(normalizedId === null\) \{[\s\S]*return null;[\s\S]*if \(menuData\.category_id !== undefined\) \{[\s\S]*parsePositiveInteger\(menuData\.category_id\)[\s\S]*if \(menuData\.price !== undefined\) \{[\s\S]*parseNonNegativePrice\(menuData\.price\)[\s\S]*if \(menuData\.status !== undefined\) \{[\s\S]*normalizeStatus\(menuData\.status, false\)/.test(menuModelSource)
  ].every(Boolean);
  if (
    /status:\s*newMenu\.status \|\| 'FOR_SALE'|category_id:\s*newMenu\.category_id|price:\s*newMenu\.price|values\.push\(menuData\.status\)|values\.push\(menuData\.category_id\)|values\.push\(menuData\.price\)/.test(menuModelSource) ||
    !menuModelValidatesWrites
  ) {
    throw new Error('Menu model must validate IDs, prices, status, and text fields before DB writes.');
  }
  if (/is_available/.test(`${swaggerSource}\n${menuRoutesSource}`)) {
    throw new Error('Admin menu OpenAPI contract must not document stale is_available fields.');
  }
  if (!/status:\s*\{[\s\S]*enum:\s*\['FOR_SALE', 'SOLD_OUT'\]/.test(swaggerSource)) {
    throw new Error('Swagger Menu schema must document the status enum.');
  }
  const createMenuRequestBlock = (menuRoutesSource.match(/\/api\/menus:[\s\S]*?\n \*   get:/) || [''])[0];
  if (!createMenuRequestBlock) {
    throw new Error('Admin menu create OpenAPI request block is missing.');
  }
  if (
    !/req\.body\.image_url !== undefined && req\.body\.image_url !== null && typeof req\.body\.image_url !== 'string'/.test(menuControllerSource) ||
    !/image_url:\s*imageUrl/.test(menuControllerSource) ||
    !/image_url:\s*normalizeOptionalText\(newMenu\.image_url, 'image_url'\)/.test(menuModelSource) ||
    !/^\s*\*\s+image_url:\s*$/m.test(createMenuRequestBlock) ||
    !/^\s*\*\s+nullable: true$/m.test(createMenuRequestBlock)
  ) {
    throw new Error('Admin menu create OpenAPI request must document the optional image_url write contract.');
  }
  if (!/^\s*\*\s+status:\s*$/m.test(createMenuRequestBlock) || !/^\s*\*\s+enum: \[FOR_SALE, SOLD_OUT\]/m.test(createMenuRequestBlock)) {
    throw new Error('Admin menu create OpenAPI request must document status.');
  }

  console.log('ok admin menu OpenAPI contract');
};

const verifyAdminStatisticsOpenApiContract = () => {
  const swaggerSource = fs.readFileSync(path.join(rootDir, 'src/config/swagger.config.js'), 'utf8');
  const statisticsRoutesSource = fs.readFileSync(path.join(rootDir, 'src/routes/admin/statistics.routes.js'), 'utf8');
  const statisticsControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/admin/statistics.controller.js'), 'utf8');
  const statisticsModelSource = fs.readFileSync(path.join(rootDir, 'src/models/statistics.model.js'), 'utf8');

  if (!/securitySchemes:\s*\{[\s\S]*\bbearerAuth:\s*\{[\s\S]*bearerFormat:\s*'JWT'/.test(swaggerSource)) {
    throw new Error('Swagger config must keep the global bearerAuth security scheme.');
  }
  if (/^\s*\*\s+components:\s*$[\s\S]*?^\s*\*\s+securitySchemes:\s*$[\s\S]*?^\s*\*\s+bearerAuth:\s*$/m.test(statisticsRoutesSource)) {
    throw new Error('Admin statistics route must not redeclare the global bearerAuth security scheme.');
  }

  const blockOrThrow = (label, pattern) => {
    const block = (statisticsRoutesSource.match(pattern) || [''])[0];
    if (!block) {
      throw new Error(`Admin statistics OpenAPI block is missing: ${label}`);
    }
    return block;
  };

  const requireFields = (block, label, fields) => {
    fields.forEach((field) => {
      if (!new RegExp(`\\b${field}:`).test(block)) {
        throw new Error(`Admin statistics OpenAPI ${label} response must document ${field}.`);
      }
    });
  };

  const dashboardBlock = blockOrThrow('dashboard', /\/api\/admin\/statistics:[\s\S]*?\n \*\/\n\n\/\*\*/);
  const salesBlock = blockOrThrow('sales', /\/api\/admin\/statistics\/sales:[\s\S]*?\n \*\/\n\n\/\*\*/);
  const topMenusBlock = blockOrThrow('top-menus', /\/api\/admin\/statistics\/top-menus:[\s\S]*?\n \*\/\n\n\/\*\*/);
  const dailySalesBlock = blockOrThrow('daily-sales', /\/api\/admin\/statistics\/daily-sales:[\s\S]*?\n \*\/\n\n\/\*\*/);
  const hourlyAnalysisBlock = blockOrThrow('hourly-analysis', /\/api\/admin\/statistics\/hourly-analysis:[\s\S]*?\n \*\/\n\n\/\*\*/);
  const categoryAnalysisBlock = blockOrThrow('category-analysis', /\/api\/admin\/statistics\/category-analysis:[\s\S]*?\n \*\/\n\n\/\*\*/);
  const reportBlock = blockOrThrow('report', /\/api\/admin\/statistics\/report:[\s\S]*?\n \*\//);

  if (!/overview:\s*salesStats/.test(statisticsModelSource) || !/topSellingMenus:\s*topMenus/.test(statisticsModelSource) || !/dailySales:\s*dailySales\.slice\(0,\s*7\)/.test(statisticsModelSource) || !/hourlyAnalysis:\s*hourlyAnalysis/.test(statisticsModelSource) || !/categoryStats:\s*categoryStats/.test(statisticsModelSource)) {
    throw new Error('Statistics dashboard model contract changed without OpenAPI verifier update.');
  }
  if (!/data:\s*dashboardStats/.test(statisticsControllerSource)) {
    throw new Error('Admin statistics dashboard controller contract changed without OpenAPI verifier update.');
  }
  if (!/\$ref:\s*'#\/components\/schemas\/Statistics'/.test(dashboardBlock)) {
    throw new Error('Admin statistics dashboard OpenAPI response must use the Statistics component schema.');
  }

  [
    'overview',
    'total_orders',
    'total_sales',
    'average_order_value',
    'completed_orders',
    'cancelled_orders',
    'pending_orders',
    'preparing_orders',
    'topSellingMenus',
    'total_revenue',
    'average_price',
    'dailySales',
    'hourlyAnalysis',
    'categoryStats',
    'generatedAt',
    'period'
  ].forEach((field) => {
    if (!new RegExp(`\\b${field}:`).test(swaggerSource)) {
      throw new Error(`Swagger Statistics schema must document ${field}.`);
    }
  });
  if (/\b(?:totalSales|totalOrders|averageOrderValue)\b/.test(swaggerSource)) {
    throw new Error('Swagger Statistics schema must not document stale camelCase aggregate fields.');
  }
  const statisticsDateRangeUsesStrictValidation = [
    /const parseDateParam = \(value, message\) => \{[\s\S]*if \(value === undefined \|\| value === ''\) \{[\s\S]*if \(typeof value !== 'string'\) \{[\s\S]*\/\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\$\/\.test\(text\)[\s\S]*new Date\(Date\.UTC\(year, month - 1, day\)\)[\s\S]*date\.getUTCFullYear\(\) !== year[\s\S]*return \{ value: text \};[\s\S]*\};/.test(statisticsControllerSource),
    /const normalizeDateRange = \(query\) => \{[\s\S]*parseDateParam\(query\.startDate, DATE_MESSAGES\.startDate\)[\s\S]*parseDateParam\(query\.endDate, DATE_MESSAGES\.endDate\)[\s\S]*start\.value && end\.value && start\.value > end\.value[\s\S]*종료 날짜는 시작 날짜보다 빠를 수 없습니다/.test(statisticsControllerSource),
    (statisticsControllerSource.match(/normalizeDateRange\(req\.query\)/g) || []).length === 7,
    (statisticsControllerSource.match(/sendDateRangeError\(res, dateRange\.error\)/g) || []).length === 7
  ].every(Boolean);
  if (/Date\.parse|isNaN\(/.test(statisticsControllerSource) || !statisticsDateRangeUsesStrictValidation) {
    throw new Error('Admin statistics controller must strictly validate YYYY-MM-DD date ranges for every date-filtered endpoint.');
  }

  requireFields(salesBlock, 'sales', [
    'total_orders',
    'total_sales',
    'average_order_value',
    'completed_orders',
    'cancelled_orders',
    'pending_orders',
    'preparing_orders',
    'period',
    'generatedAt'
  ]);
  if (/\b(?:totalSales|totalOrders|averageOrderValue)\b/.test(salesBlock) || /type:\s*string[\s\S]*example:\s*"2025-06-01 ~ 2025-06-15"/.test(salesBlock)) {
    throw new Error('Admin statistics sales OpenAPI response must not document stale camelCase fields or string period.');
  }

  if (!/menus:\s*topMenus/.test(statisticsControllerSource) || !/count:\s*topMenus\.length/.test(statisticsControllerSource)) {
    throw new Error('Admin top menus controller contract changed without OpenAPI verifier update.');
  }
  const getTopSellingMenusControllerBlock = (statisticsControllerSource.match(/const getTopSellingMenus = async \(req, res\) => \{[\s\S]*?\n\};\n\n\/\/ 일별 매출 현황 조회/) || [''])[0];
  const topMenusControllerUsesStrictLimit = [
    /const rawLimit = req\.query\.limit === undefined/.test(getTopSellingMenusControllerBlock),
    /\? '10'/.test(getTopSellingMenusControllerBlock),
    /typeof req\.query\.limit === 'string' \? req\.query\.limit\.trim\(\) : ''/.test(getTopSellingMenusControllerBlock),
    /const limitNum = \/\^\[1-9\]\[0-9\]\*\$\/\.test\(rawLimit\) \? Number\(rawLimit\) : null;/.test(getTopSellingMenusControllerBlock),
    /!Number\.isSafeInteger\(limitNum\) \|\| limitNum > 100/.test(getTopSellingMenusControllerBlock),
    /Statistics\.getTopSellingMenus\(limitNum, startDate, endDate\)/.test(getTopSellingMenusControllerBlock)
  ].every(Boolean);
  if (
    /parseInt\(limit\)|isNaN\(limitNum\)/.test(getTopSellingMenusControllerBlock) ||
    !topMenusControllerUsesStrictLimit
  ) {
    throw new Error('Admin top menus controller must strictly validate the 1-100 limit query before calling Statistics.getTopSellingMenus.');
  }
  if (
    /parseInt\(limit, 10\)/.test(statisticsModelSource) ||
    !/const rawLimit = typeof limit === 'string' \? limit\.trim\(\) : '';[\s\S]*const safeLimit = typeof limit === 'number'[\s\S]*\/\^\[1-9\]\[0-9\]\*\$\/\.test\(rawLimit\) \? Number\(rawLimit\) : null[\s\S]*const normalizedLimit = Number\.isSafeInteger\(safeLimit\) && safeLimit > 0[\s\S]*\? Math\.min\(safeLimit, 100\)[\s\S]*: 10;/.test(statisticsModelSource)
  ) {
    throw new Error('Statistics.getTopSellingMenus must inline only strict safe integer LIMIT values.');
  }
  requireFields(topMenusBlock, 'top-menus', [
    'menus',
    'menu_id',
    'menu_name',
    'category_name',
    'total_quantity',
    'order_count',
    'total_revenue',
    'average_price',
    'count',
    'period',
    'generatedAt'
  ]);
  if (!/maximum:\s*100/.test(topMenusBlock) || /\brank:/.test(topMenusBlock) || /\btotal_sales:/.test(topMenusBlock)) {
    throw new Error('Admin top menus OpenAPI response must match the wrapped menus contract and 1-100 limit.');
  }

  if (!/sales:\s*dailySales/.test(statisticsControllerSource) || !/hourlyStats:\s*hourlyData/.test(statisticsControllerSource) || !/categories:\s*categoryStats/.test(statisticsControllerSource)) {
    throw new Error('Admin statistics controller wrapper contract changed without OpenAPI verifier update.');
  }
  if (/SUM\(oi\.quantity\) as total_quantity/.test(statisticsModelSource) || !/COALESCE\(SUM\(oi\.quantity\), 0\) as total_quantity/.test(statisticsModelSource)) {
    throw new Error('Statistics total_quantity aggregates must be non-null to match OpenAPI and EJS rendering contracts.');
  }
  requireFields(dailySalesBlock, 'daily-sales', ['sales', 'sale_date', 'order_count', 'daily_sales', 'completed_orders', 'cancelled_orders', 'count', 'period', 'generatedAt']);
  requireFields(hourlyAnalysisBlock, 'hourly-analysis', ['hourlyStats', 'order_hour', 'order_count', 'hourly_sales', 'average_order_value', 'period', 'generatedAt']);
  requireFields(categoryAnalysisBlock, 'category-analysis', ['categories', 'category_id', 'category_name', 'order_count', 'total_quantity', 'category_revenue', 'menu_count', 'count', 'period', 'generatedAt']);

  if (!/report:\s*dashboardStats/.test(statisticsControllerSource) || !/reportType:\s*'comprehensive'/.test(statisticsControllerSource)) {
    throw new Error('Admin statistics report controller contract changed without OpenAPI verifier update.');
  }
  if (/exports\.(?:getDashboard|getSalesStatistics|getTopSellingMenus|getDailySales|getHourlyAnalysis|getCategoryAnalysis|generateSalesReport)/.test(statisticsControllerSource)) {
    throw new Error('Admin statistics controller must not assign handlers through exports.* before rebuilding module.exports.');
  }
  requireFields(reportBlock, 'report', ['report', 'reportType', 'generatedAt']);
  if (!/\$ref:\s*'#\/components\/schemas\/Statistics'/.test(reportBlock)) {
    throw new Error('Admin statistics report OpenAPI response must document the Statistics report payload.');
  }

  console.log('ok admin statistics OpenAPI contract');
};

const verifyPublicOpenApiContracts = () => {
  const publicCategoryRoutesSource = fs.readFileSync(path.join(rootDir, 'src/routes/public/category.routes.js'), 'utf8');
  const publicMenuRoutesSource = fs.readFileSync(path.join(rootDir, 'src/routes/public/menu.routes.js'), 'utf8');
  const publicOrderRoutesSource = fs.readFileSync(path.join(rootDir, 'src/routes/public/order.routes.js'), 'utf8');
  const publicCategoryControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/public/category.controller.js'), 'utf8');
  const publicMenuControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/public/menu.controller.js'), 'utf8');
  const publicOrderControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/public/order.controller.js'), 'utf8');
  const publicKioskStatusControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/public/kioskStatus.controller.js'), 'utf8');
  const errorMiddlewareSource = fs.readFileSync(path.join(rootDir, 'src/middleware/error.middleware.js'), 'utf8');
  const orderModelSource = fs.readFileSync(path.join(rootDir, 'src/models/order.model.js'), 'utf8');
  const auditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');
  const frontendPublicApiSource = fs.readFileSync(path.join(rootDir, 'frontend/src/services/publicApi.ts'), 'utf8');
  const categoryModelSource = fs.readFileSync(path.join(rootDir, 'src/models/category.model.js'), 'utf8');
  const publicCategory200Block = (publicCategoryRoutesSource.match(/\*       200:[\s\S]*?\*       500:/) || [''])[0];
  const publicMenu200Block = (publicMenuRoutesSource.match(/\*       200:[\s\S]*?\*       400:/) || [''])[0];
  const publicOrder201Block = (publicOrderRoutesSource.match(/\*       201:[\s\S]*?\*       400:/) || [''])[0];

  if (!/categoryId:\s*category\.id/.test(publicCategoryControllerSource) || !/sortOrder:\s*category\.sort_order/.test(publicCategoryControllerSource)) {
    throw new Error('Public category controller contract changed without OpenAPI verifier update.');
  }
  if (/활성화된/.test(publicCategoryRoutesSource) && !/is_active/.test(categoryModelSource)) {
    throw new Error('Public category OpenAPI text must not claim active filtering when Categories has no active field.');
  }
  if (/\$ref:\s*'#\/components\/schemas\/Category'/.test(publicCategory200Block) || /is_active|created_at|updated_at/.test(publicCategory200Block)) {
    throw new Error('Public category OpenAPI response must not document the admin/DB category schema.');
  }
  if (!/categoryId:/.test(publicCategory200Block) || !/sortOrder:/.test(publicCategory200Block)) {
    throw new Error('Public category OpenAPI response must document categoryId and sortOrder.');
  }

  ['menuId', 'imageUrl', 'status', 'categoryId'].forEach((field) => {
    if (!new RegExp(`${field}:`).test(publicMenuControllerSource)) {
      throw new Error(`Public menu controller must expose ${field}.`);
    }
    if (!new RegExp(`${field}:`).test(publicMenu200Block)) {
      throw new Error(`Public menu OpenAPI response must document ${field}.`);
    }
  });
  if (/\$ref:\s*'#\/components\/schemas\/Menu'/.test(publicMenu200Block) || /image_url|category_name|is_available|created_at|updated_at/.test(publicMenu200Block)) {
    throw new Error('Public menu OpenAPI response must not document the admin/DB menu schema.');
  }
  if (
    /parseInt\(categoryId, 10\)|isNaN\(parsedCategoryId\)/.test(publicMenuControllerSource) ||
    !/const rawCategoryId = typeof categoryId === 'string' \? categoryId\.trim\(\) : '';[\s\S]*const parsedCategoryId = \/\^\[1-9\]\[0-9\]\*\$\/\.test\(rawCategoryId\) \? Number\(rawCategoryId\) : null;[\s\S]*if \(!Number\.isSafeInteger\(parsedCategoryId\)\) \{[\s\S]*유효하지 않은 카테고리 ID입니다/.test(publicMenuControllerSource)
  ) {
    throw new Error('Public menu categoryId query must use strict positive safe-integer validation.');
  }
  if (!/status:\s*'FOR_SALE'/.test(publicMenuControllerSource) || /SOLD_OUT/.test(publicMenu200Block)) {
    throw new Error('Public menu OpenAPI response must only document FOR_SALE statuses returned by the controller.');
  }
  if (/\/uploads\/menus\/americano\.jpg/.test(publicMenu200Block) || !/\/uploads\/menus\/menu-1-1700000000000\.png/.test(publicMenu200Block)) {
    throw new Error('Public menu OpenAPI imageUrl example must match the upload filename pattern.');
  }
  if (!/imageUrl\?:\s*string \| null/.test(frontendPublicApiSource) || !/menu\.imageUrl/.test(frontendPublicApiSource)) {
    throw new Error('Frontend public API adapter must consume the documented imageUrl field.');
  }
  const publicMenuAmountIsStrict = [
    !/parseFloat\(|Number\.parseFloat\(/.test(publicMenuControllerSource),
    publicMenuControllerSource.includes("const parsed = /^(0|[1-9][0-9]*)(\\.[0-9]+)?$/.test(text) ? Number(text) : null;"),
    /if \(parsed !== null && Number\.isFinite\(parsed\)\) \{/.test(publicMenuControllerSource),
    /price:\s*parseNonNegativeAmount\(menu\.price\)/.test(publicMenuControllerSource)
  ].every(Boolean);
  if (!publicMenuAmountIsStrict) {
    throw new Error('Public menu controller must strictly normalize DB menu prices without partial numeric parsing.');
  }

  const publicOrderAmountsAreStrict = [
    !/parseFloat\(|Number\.parseFloat\(/.test(publicOrderControllerSource),
    publicOrderControllerSource.includes("const parsed = /^(0|[1-9][0-9]*)(\\.[0-9]+)?$/.test(text) ? Number(text) : null;"),
    /totalPrice:\s*parseNonNegativeAmount\(detailedOrder\.total_price\)/.test(publicOrderControllerSource),
    /const pricePerItem = parseNonNegativeAmount\(item\.price_per_item\);/.test(publicOrderControllerSource),
    /pricePerItem,[\s\S]*price:\s*Number\(\(pricePerItem \* item\.quantity\)\.toFixed\(2\)\)/.test(publicOrderControllerSource)
  ].every(Boolean);
  if (!publicOrderAmountsAreStrict) {
    throw new Error('Public order controller must strictly normalize DB order amounts without partial numeric parsing.');
  }
  if (/\bcatchAsync\b/.test(publicOrderControllerSource) || /\bcatchAsync\b/.test(errorMiddlewareSource)) {
    throw new Error('Public order creation must not keep the single-use catchAsync helper or middleware export.');
  }
  if (
    /const validateOrderData\s*=|validateOrderData\(/.test(publicOrderControllerSource) ||
    !/const MAX_ORDER_ITEMS = 100;/.test(publicOrderControllerSource) ||
    !/const MAX_ORDER_ITEM_QUANTITY = 99;/.test(publicOrderControllerSource) ||
    !/if \(!req\.body\.items \|\| !Array\.isArray\(req\.body\.items\) \|\| req\.body\.items\.length === 0\) \{\s*throw new AppError\("주문 항목이 필요합니다\. 'items' 배열에 최소 하나의 항목을 포함해야 합니다\.", 400\);\s*\}[\s\S]*if \(req\.body\.items\.length > MAX_ORDER_ITEMS\) \{[\s\S]*주문 항목은 최대 \$\{MAX_ORDER_ITEMS\}개까지 허용됩니다\.[\s\S]*for \(const item of req\.body\.items\) \{[\s\S]*item\.menuId === undefined \|\| item\.quantity === undefined[\s\S]*!Number\.isSafeInteger\(item\.menuId\) \|\| item\.menuId <= 0[\s\S]*!Number\.isSafeInteger\(item\.quantity\) \|\| item\.quantity <= 0 \|\| item\.quantity > MAX_ORDER_ITEM_QUANTITY/.test(publicOrderControllerSource)
  ) {
    throw new Error('Public order creation must inline bounded request item validation without a single-use validateOrderData helper.');
  }
  if (!/exports\.create\s*=\s*async\s*\(\s*req,\s*res,\s*next\s*\)\s*=>/.test(publicOrderControllerSource) || !/catch\s*\(\s*error\s*\)\s*\{\s*next\(error\);\s*\}/.test(publicOrderControllerSource)) {
    throw new Error('Public order creation must forward async failures to Express with next(error).');
  }
  const orderCreateBlock = (orderModelSource.match(/Order\.create = async \(orderData\) => \{[\s\S]*?\/\/ Retrieve a single order/) || [''])[0];
  if (/userId \(optional, future\)|orderData = \{ userId/.test(orderCreateBlock)) {
    throw new Error('Order.create comments must document the live public order input contract only.');
  }
  if (!/maxItems:\s*100/.test(publicOrderRoutesSource) || !/minItems:\s*1/.test(publicOrderRoutesSource) || !/minimum:\s*1[\s\S]*maximum:\s*99/.test(publicOrderRoutesSource)) {
    throw new Error('Public order OpenAPI request schema must document the 1-100 item count and 1-99 item quantity contracts.');
  }
  [
    ['orderId', /orderId:\s*detailedOrder\.id/],
    ['totalPrice', /totalPrice:\s*parseNonNegativeAmount\(detailedOrder\.total_price\)/],
    ['status', /status:\s*detailedOrder\.status/],
    ['createdAt', /createdAt:\s*detailedOrder\.created_at/],
    ['menuId', /menuId:\s*item\.menu_id/],
    ['menuName', /menuName:\s*item\.menu_name/],
    ['pricePerItem', /pricePerItem,/],
    ['price', /price:\s*Number\(\(pricePerItem \* item\.quantity\)\.toFixed\(2\)\)/]
  ].forEach(([field, pattern]) => {
    if (!pattern.test(publicOrderControllerSource) || !new RegExp(`${field}:`).test(publicOrder201Block)) {
      throw new Error(`Public order response must keep the documented ${field} contract.`);
    }
  });
  if (!/공개 주문 생성.*100개/.test(auditSource) || !/품목당 수량 99개/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the public order item count and per-item quantity bounds.');
  }
  const orderItemLimitGuardIndex = orderCreateBlock.indexOf('if (orderItems.length > MAX_ORDER_ITEMS)');
  const orderItemNormalizationIndex = orderCreateBlock.indexOf('const normalizedOrderItems = orderItems.map');
  const orderConnectionIndex = orderCreateBlock.indexOf('const connection = await sql.getConnection()');
  if (
    !/const MAX_ORDER_ITEMS = 100;/.test(orderModelSource) ||
    !/const MAX_ORDER_ITEM_QUANTITY = 99;/.test(orderModelSource) ||
    !/const orderItems = Array\.isArray\(orderData\?\.items\) \? orderData\.items : \[\];/.test(orderCreateBlock) ||
    !/if \(orderItems\.length === 0\) \{[\s\S]*Order items are required\./.test(orderCreateBlock) ||
    orderItemLimitGuardIndex === -1 ||
    orderItemNormalizationIndex === -1 ||
    orderConnectionIndex === -1 ||
    orderItemLimitGuardIndex > orderConnectionIndex ||
    orderItemNormalizationIndex > orderConnectionIndex ||
    !/const normalizedOrderItems = orderItems\.map\(\(item\) => \{[\s\S]*const menuId = parsePositiveInteger\(item\.menu_id\);[\s\S]*const quantity = parsePositiveInteger\(item\.quantity\);[\s\S]*quantity === null \|\| quantity > MAX_ORDER_ITEM_QUANTITY[\s\S]*return \{ menu_id: menuId, quantity \};[\s\S]*\}\);/.test(orderCreateBlock) ||
    /for \(const item of orderData\.items\)/.test(orderCreateBlock)
  ) {
    throw new Error('Order.create must validate item count and item quantities before opening a DB transaction connection.');
  }
  const orderItemLimitSmoke = `
const Module = require('module');
const originalLoad = Module._load;
Module._load = (request, parent, isMain) => {
  if (request === './db.js' && parent && String(parent.filename).endsWith('src/models/order.model.js')) {
    return {
      getConnection: async () => {
        throw new Error('Order.create should reject too many items before DB connection');
      }
    };
  }
  return originalLoad(request, parent, isMain);
};
(async () => {
  const Order = require('./src/models/order.model.js');
  const items = Array.from({ length: 101 }, () => ({ menu_id: 1, quantity: 1 }));
  try {
    await Order.create({ items });
  } catch (error) {
    if (error.message !== 'Order items must not exceed 100.') {
      throw error;
    }
    return;
  }
  throw new Error('Order.create accepted too many items');
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
  const orderItemLimitResult = spawnSync(process.execPath, ['-e', orderItemLimitSmoke], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 10000
  });
  if (orderItemLimitResult.status !== 0) {
    throw new Error(`Order.create should reject more than 100 items before DB connection:\n${orderItemLimitResult.stdout}\n${orderItemLimitResult.stderr}`);
  }
  const orderItemQuantityLimitSmoke = `
const Module = require('module');
const originalLoad = Module._load;
Module._load = (request, parent, isMain) => {
  if (request === './db.js' && parent && String(parent.filename).endsWith('src/models/order.model.js')) {
    return {
      getConnection: async () => {
        throw new Error('Order.create should reject oversized item quantity before DB connection');
      }
    };
  }
  return originalLoad(request, parent, isMain);
};
(async () => {
  const Order = require('./src/models/order.model.js');
  try {
    await Order.create({ items: [{ menu_id: 1, quantity: 100 }] });
  } catch (error) {
    if (error.message !== 'Quantity for menu item ID 1 must be a positive integer no greater than 99.') {
      throw error;
    }
    return;
  }
  throw new Error('Order.create accepted an oversized item quantity');
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
  const orderItemQuantityLimitResult = spawnSync(process.execPath, ['-e', orderItemQuantityLimitSmoke], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 10000
  });
  if (orderItemQuantityLimitResult.status !== 0) {
    throw new Error(`Order.create should reject item quantity above 99 before DB connection:\n${orderItemQuantityLimitResult.stdout}\n${orderItemQuantityLimitResult.stderr}`);
  }
  if (/status:\s*'RECEIVED'/.test(publicOrderControllerSource) || /orderData\.status|total_price,\s*status|orderStatus/.test(orderCreateBlock)) {
    throw new Error('Public order creation must rely on the Orders.status schema default instead of carrying an unused status input.');
  }
  if (!/status:[\s\S]*?enum: \[RECEIVED\]/.test(publicOrder201Block) || /enum: \[RECEIVED, PREPARING/.test(publicOrder201Block)) {
    throw new Error('Public order create response must document the initial RECEIVED status only.');
  }
  if (!/return \{\s*id:\s*orderId\s*\};/.test(orderCreateBlock) || /total_price:\s*calculatedTotalPrice|status:\s*orderStatus|items:\s*orderItemsData/.test(orderCreateBlock)) {
    throw new Error('Order.create must only return the inserted order id; callers fetch detailed order data explicitly.');
  }
  if (
    /parseFloat\(|Number\.parseFloat\(/.test(orderCreateBlock) ||
    /String\(value \|\| ''\)/.test(orderModelSource) ||
    /const Menu = require\('\.\/menu\.model\.js'\)|Menu\.findById/.test(orderModelSource) ||
    !/const parsePositiveInteger = \(value\) => \{[\s\S]*typeof value === 'number'[\s\S]*typeof value === 'string' \? value\.trim\(\) : ''[\s\S]*\/\^\[1-9\]\[0-9\]\*\$\/\.test\(text\) \? Number\(text\) : null;[\s\S]*return Number\.isSafeInteger\(parsed\) \? parsed : null;[\s\S]*\};/.test(orderModelSource) ||
    !orderModelSource.includes("const parsed = /^(0|[1-9][0-9]*)(\\.[0-9]+)?$/.test(text) ? Number(text) : null;") ||
    !/const normalizedOrderItems = orderItems\.map\(\(item\) => \{[\s\S]*const menuId = parsePositiveInteger\(item\.menu_id\);[\s\S]*const quantity = parsePositiveInteger\(item\.quantity\);[\s\S]*Menu item ID must be a positive integer/.test(orderCreateBlock) ||
    !/Quantity for menu item ID \$\{menuId\} must be a positive integer no greater than \$\{MAX_ORDER_ITEM_QUANTITY\}\./.test(orderCreateBlock) ||
    !/for \(const item of normalizedOrderItems\) \{[\s\S]*const \[menuRows\] = await connection\.execute\(\s*"SELECT id, price, status FROM Menus WHERE id = \?",\s*\[item\.menu_id\]\s*\);\s*const menuItem = menuRows\[0\];/.test(orderCreateBlock) ||
    !/const priceAtOrderTime = parseNonNegativeAmount\(menuItem\.price\);/.test(orderCreateBlock) ||
    !/calculatedTotalPrice \+= priceAtOrderTime \* item\.quantity;/.test(orderCreateBlock) ||
    !/menu_id:\s*item\.menu_id,[\s\S]*quantity:\s*item\.quantity,[\s\S]*price_per_item:\s*priceAtOrderTime/.test(orderCreateBlock) ||
    !/calculatedTotalPrice = Number\(calculatedTotalPrice\.toFixed\(2\)\);/.test(orderCreateBlock) ||
    /Promise\.all\(orderItemPromises\)|const orderItemPromises = orderItemsData\.map/.test(orderCreateBlock) ||
    !/for \(const item of orderItemsData\) \{\s*await connection\.execute\(\s*"INSERT INTO OrderItems \(order_id, menu_id, quantity, price_per_item\) VALUES \(\?, \?, \?, \?\)",\s*\[orderId, item\.menu_id, item\.quantity, item\.price_per_item\]\s*\);\s*\}/.test(orderCreateBlock)
  ) {
    throw new Error('Order.create must strictly normalize item IDs, quantities, menu prices, rounded totals, and sequential item inserts on the transaction connection before DB writes.');
  }
  if (!/menuId:/.test(publicOrder201Block) || !/pricePerItem:/.test(publicOrder201Block)) {
    throw new Error('Public order OpenAPI response items must document menuId and pricePerItem.');
  }
  if (
    /const\s+getBearerToken|getBearerToken\(|const\s+verifyStatusToken\s*=|verifyStatusToken\(/.test(publicKioskStatusControllerSource) ||
    !/const crypto = require\('crypto'\);/.test(publicKioskStatusControllerSource) ||
    !/const requiredToken = process\.env\.KIOSK_STATUS_TOKEN;[\s\S]*if \(requiredToken\) \{[\s\S]*const authorization = req\.get\('authorization'\) \|\| '';[\s\S]*const bearerToken = authorization\.startsWith\('Bearer '\) \? authorization\.slice\(7\) : authorization;[\s\S]*const providedToken = req\.get\('x-kiosk-status-token'\) \|\| bearerToken;[\s\S]*const requiredBuffer = Buffer\.from\(requiredToken\);[\s\S]*const providedBuffer = Buffer\.from\(providedToken\);[\s\S]*const tokenIsValid = requiredBuffer\.length === providedBuffer\.length &&[\s\S]*crypto\.timingSafeEqual\(requiredBuffer, providedBuffer\);[\s\S]*if \(!tokenIsValid\)[\s\S]*return res\.status\(403\)\.json\(\{ message: 'Invalid kiosk status token\.' \}\);/.test(publicKioskStatusControllerSource) ||
    /providedToken !== requiredToken/.test(publicKioskStatusControllerSource)
  ) {
    throw new Error('Public kiosk status report must not keep single-use token helper wrappers; report() owns direct token parsing and timing-safe comparison.');
  }
  const publicKioskStatusUsesStrictBodyAliases = [
    /const trimToLength = \(value, maxLength\) => \{[\s\S]*if \(value === undefined \|\| value === null\) return null;[\s\S]*if \(typeof value !== 'string'\) return null;[\s\S]*const text = value\.trim\(\);/.test(publicKioskStatusControllerSource),
    /const kioskId = trimToLength\(req\.body\.kioskId \?\? req\.body\.kiosk_id, 100\);/.test(publicKioskStatusControllerSource),
    /const rawStatus = req\.body\.status === undefined \|\| req\.body\.status === null \|\| req\.body\.status === ''[\s\S]*\? 'ONLINE'[\s\S]*: req\.body\.status;[\s\S]*const status = trimToLength\(rawStatus, 50\);/.test(publicKioskStatusControllerSource),
    /app_version: trimToLength\(req\.body\.appVersion \?\? req\.body\.app_version, 100\)/.test(publicKioskStatusControllerSource)
  ].every(Boolean);
  if (/req\.body\.kioskId \|\| req\.body\.kiosk_id|req\.body\.status \|\| 'ONLINE'|req\.body\.appVersion \|\| req\.body\.app_version|String\(value\)\.trim\(\)/.test(publicKioskStatusControllerSource) || !publicKioskStatusUsesStrictBodyAliases) {
    throw new Error('Public kiosk status report must not coerce non-string body values or use truthy alias fallbacks.');
  }

  console.log('ok public OpenAPI contracts');
};

const verifyOpenApiPathCoverage = () => {
  const { swaggerSpec } = require(path.join(rootDir, 'src/config/swagger.config.js'));
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const requiredOperations = {
    '/healthz': ['get'],
    '/readyz': ['get'],
    '/metrics': ['get'],
    '/api': ['get'],
    '/api-docs.json': ['get'],
    '/api/admin/login': ['post'],
    '/api/admin/orders': ['get'],
    '/api/admin/orders/{orderId}': ['get'],
    '/api/admin/orders/{orderId}/status': ['patch'],
    '/api/admin/orders/{orderId}/cancel': ['patch'],
    '/api/admin/statistics': ['get'],
    '/api/admin/statistics/sales': ['get'],
    '/api/admin/statistics/top-menus': ['get'],
    '/api/admin/statistics/daily-sales': ['get'],
    '/api/admin/statistics/hourly-analysis': ['get'],
    '/api/admin/statistics/category-analysis': ['get'],
    '/api/admin/statistics/report': ['get'],
    '/api/admin/kiosks/status': ['get'],
    '/api/categories': ['get', 'post'],
    '/api/categories/{id}': ['get', 'put', 'delete'],
    '/api/menus': ['get', 'post'],
    '/api/menus/{id}': ['get', 'put', 'delete'],
    '/api/menus/{menuId}/image': ['post'],
    '/api/public/categories': ['get'],
    '/api/public/menus': ['get'],
    '/api/public/orders': ['post'],
    '/api/public/kiosk/status': ['post']
  };

  Object.entries(requiredOperations).forEach(([apiPath, methods]) => {
    const pathSpec = swaggerSpec.paths[apiPath];
    if (!pathSpec) {
      throw new Error(`OpenAPI path is missing for live route: ${apiPath}`);
    }

    methods.forEach((method) => {
      if (!pathSpec[method]) {
        throw new Error(`OpenAPI operation is missing for live route: ${method.toUpperCase()} ${apiPath}`);
      }
    });
  });

  [
    'GET    /api',
    'GET    /api-docs.json',
    'POST   /api/admin/login',
    'GET    /api/admin/orders',
    'GET    /api/admin/orders/:orderId',
    'PATCH  /api/admin/orders/:orderId/status',
    'PATCH  /api/admin/orders/:orderId/cancel',
    'GET    /api/admin/statistics',
    'GET    /api/admin/statistics/sales',
    'GET    /api/admin/statistics/top-menus',
    'GET    /api/admin/statistics/daily-sales',
    'GET    /api/admin/statistics/hourly-analysis',
    'GET    /api/admin/statistics/category-analysis',
    'GET    /api/admin/statistics/report',
    'GET    /api/admin/kiosks/status',
    'GET    /api/categories',
    'POST   /api/categories',
    'GET    /api/categories/:id',
    'PUT    /api/categories/:id',
    'DELETE /api/categories/:id',
    'GET    /api/menus',
    'POST   /api/menus',
    'GET    /api/menus/:id',
    'PUT    /api/menus/:id',
    'DELETE /api/menus/:id',
    'POST   /api/menus/:menuId/image'
  ].forEach((line) => {
    if (!readmeSource.includes(line)) {
      throw new Error(`README.md admin endpoint inventory is missing: ${line}`);
    }
  });
  if (/\/api\/admin\/orders\/:id/.test(readmeSource)) {
    throw new Error('README.md admin endpoint inventory must use :orderId for admin order item routes.');
  }
  if (/GET\s+\/api\/admin\/statistics\/\*/.test(readmeSource)) {
    throw new Error('README.md admin endpoint inventory must list concrete admin statistics routes instead of a wildcard.');
  }

  console.log('ok OpenAPI path coverage');
};

const verifyWebAdminCsrfContract = () => {
  const csrfSource = fs.readFileSync(path.join(rootDir, 'src/middleware/csrf.middleware.js'), 'utf8');
  const webAdminRoutesSource = fs.readFileSync(path.join(rootDir, 'src/routes/webAdmin.routes.js'), 'utf8');
  const layoutSource = fs.readFileSync(path.join(rootDir, 'src/views/layouts/admin.ejs'), 'utf8');
  const loginSource = fs.readFileSync(path.join(rootDir, 'src/views/admin/login.ejs'), 'utf8');
  const navbarSource = fs.readFileSync(path.join(rootDir, 'src/views/partials/navbar.ejs'), 'utf8');
  const categorySource = fs.readFileSync(path.join(rootDir, 'src/views/admin/categories.ejs'), 'utf8');
  const menuSource = fs.readFileSync(path.join(rootDir, 'src/views/admin/menus.ejs'), 'utf8');
  const statisticsSource = fs.readFileSync(path.join(rootDir, 'src/views/admin/statistics.ejs'), 'utf8');
  const dashboardSource = fs.readFileSync(path.join(rootDir, 'src/views/admin/dashboard.ejs'), 'utf8');
  const webAdminControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/webAdmin.controller.js'), 'utf8');
  const orderSource = fs.readFileSync(path.join(rootDir, 'src/views/admin/orders.ejs'), 'utf8');
  const adminJsSource = fs.readFileSync(path.join(rootDir, 'public/js/admin.js'), 'utf8');
  const e2eSource = fs.readFileSync(path.join(rootDir, 'scripts/e2e-db-api.js'), 'utf8');
  const opsSmokeSource = fs.readFileSync(path.join(rootDir, 'scripts/ops-smoke.js'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const auditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');
  const serverSource = fs.readFileSync(path.join(rootDir, 'src/server.js'), 'utf8');
  const orderModelSource = fs.readFileSync(path.join(rootDir, 'src/models/order.model.js'), 'utf8');
  const adminOrderControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/admin/order.controller.js'), 'utf8');
  const adminOrderRoutesSource = fs.readFileSync(path.join(rootDir, 'src/routes/admin/orders.routes.js'), 'utf8');
  const adminKioskStatusControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/admin/kioskStatus.controller.js'), 'utf8');

  if (!/crypto\.timingSafeEqual/.test(csrfSource) || !/x-csrf-token/.test(csrfSource) || !/status\(403\)\.json/.test(csrfSource)) {
    throw new Error('CSRF middleware must use timing-safe comparison, support X-CSRF-Token, and reject JSON with 403.');
  }
  if (
    /const generateToken\s*=|const wantsJson\s*=|const getOrCreateCsrfToken\s*=|const tokensMatch\s*=|generateToken\(|wantsJson\(|getOrCreateCsrfToken\(|tokensMatch\(/.test(csrfSource) ||
    !/if \(!req\.session\[CSRF_SESSION_KEY\]\) \{[\s\S]*req\.session\[CSRF_SESSION_KEY\] = crypto\.randomBytes\(TOKEN_BYTES\)\.toString\('hex'\);[\s\S]*res\.locals\.csrfToken = req\.session\[CSRF_SESSION_KEY\];/.test(csrfSource) ||
    !/const expectedBuffer = Buffer\.from\(String\(expectedToken\)\);[\s\S]*const providedBuffer = Buffer\.from\(String\(providedToken\)\);[\s\S]*tokenIsValid = expectedBuffer\.length === providedBuffer\.length &&[\s\S]*crypto\.timingSafeEqual\(expectedBuffer, providedBuffer\);/.test(csrfSource) ||
    !/req\.is\('application\/json'\) \|\| req\.xhr \|\| \/\\bjson\\b\/i\.test\(req\.get\('accept'\) \|\| ''\)/.test(csrfSource)
  ) {
    throw new Error('CSRF middleware must not keep single-use token/json helper wrappers.');
  }
  if (!/router\.use\(attachCsrfToken\)/.test(webAdminRoutesSource)) {
    throw new Error('webAdmin.routes.js must attach CSRF tokens to admin views.');
  }
  const unprotectedPostRoutes = webAdminRoutesSource
    .split('\n')
    .filter(line => /router\.post\(/.test(line) && !/verifyCsrfToken/.test(line));
  if (unprotectedPostRoutes.length > 0) {
    throw new Error(`webAdmin.routes.js has POST routes without CSRF verification: ${unprotectedPostRoutes.join(' | ')}`);
  }
  if (
    /router\.get\('\/logout'/.test(webAdminRoutesSource) ||
    /href="\/admin\/logout"/.test(navbarSource) ||
    !/router\.post\('\/logout', verifyCsrfToken, webAdminController\.logout\)/.test(webAdminRoutesSource) ||
    !/method="post"\s+action="\/admin\/logout"[\s\S]*name="_csrf"\s+value="<%=\s*csrfToken\s*%>"/.test(navbarSource) ||
    !/req\.session\.destroy\(\(error\) => \{[\s\S]*logger\.logError\(error, req, \{ context: 'Web admin logout' \}\);[\s\S]*res\.redirect\('\/admin\/login'\);/.test(webAdminControllerSource) ||
    !/const logoutResponse = await requestText\(baseUrl, 'POST', '\/admin\/logout'[\s\S]*_csrf:\s*csrfToken[\s\S]*const postLogoutDashboard = await requestText\(baseUrl, 'GET', '\/admin'/.test(e2eSource)
  ) {
    throw new Error('Web admin logout must be a CSRF-protected POST form, log session destroy failures, and be covered by DB/API E2E.');
  }
  if (!/meta name="csrf-token"\s+content="<%=\s*csrfToken\s*%>"/.test(layoutSource)) {
    throw new Error('Admin layout must expose the attached CSRF token meta without empty-token fallback.');
  }
  if (!/res\.locals\.success = req\.flash\('success'\)/.test(serverSource) || !/res\.locals\.error = req\.flash\('error'\)/.test(serverSource)) {
    throw new Error('server.js must attach flash message arrays to admin views.');
  }
  const errorViewPath = path.join(rootDir, 'src/views/error.ejs');
  if (!fs.existsSync(errorViewPath)) {
    throw new Error('Web admin error handlers render error.ejs, so src/views/error.ejs must exist.');
  }
  const errorViewSource = fs.readFileSync(errorViewPath, 'utf8');
  if (!/res\.locals\.currentPage = '';/.test(serverSource) || !/error\.message/.test(errorViewSource)) {
    throw new Error('Web admin error view must render inside the admin layout with default currentPage and a safe error message.');
  }
  if (/typeof (?:success|error)/.test(`${layoutSource}\n${loginSource}`)) {
    throw new Error('Admin views must not fallback flash locals that server.js always attaches.');
  }
  if (/form\.submit\(\)|addEventListener\('keypress'/.test(loginSource) || !/id="username"[\s\S]*autofocus/.test(loginSource)) {
    throw new Error('Admin login page must rely on native form submit and declarative autofocus instead of redundant keypress submit JS.');
  }
  [loginSource, categorySource, menuSource].forEach((source) => {
    if (!/name="_csrf"\s+value="<%=\s*csrfToken\s*%>"/.test(source)) {
      throw new Error('Admin POST forms must include hidden CSRF token inputs.');
    }
  });
  if (/menus\s*&&\s*menus\.length|categories\s*&&\s*categories\.length/.test(`${menuSource}\n${categorySource}`)) {
    throw new Error('Web admin menu/category templates must not fallback arrays provided by their controllers.');
  }
  if (/<div class="d-none">[\s\S]*<form id="(?:category|menu)-(?:update|delete)-/.test(`${categorySource}\n${menuSource}`)) {
    throw new Error('Web admin menu/category templates must not wrap external submit forms in no-op hidden containers; form attributes own submission.');
  }
  if (
    !/form="category-update-<%=\s*category\.id\s*%>"/.test(categorySource) ||
    !/form="category-delete-<%=\s*category\.id\s*%>"/.test(categorySource) ||
    !/form="menu-update-<%=\s*menu\.id\s*%>"/.test(menuSource) ||
    !/form="menu-delete-<%=\s*menu\.id\s*%>"/.test(menuSource)
  ) {
    throw new Error('Web admin menu/category row controls must keep explicit form attributes after pruning hidden form wrappers.');
  }
  if (
    /<% if \(categories\.length > 0\) \{ %>\s*<% categories\.forEach\(function\(category\) \{ %>\s*<form id="category-update-/.test(categorySource) ||
    /<% if \(menus\.length > 0\) \{ %>\s*<% menus\.forEach\(function\(menu\) \{ %>\s*<form id="menu-update-/.test(menuSource)
  ) {
    throw new Error('Web admin menu/category hidden form loops must not wrap array forEach with redundant non-empty guards.');
  }
  if (/category_id\s*\|\|\s*['"]none['"]/.test(webAdminControllerSource)) {
    throw new Error('Web admin categories page must not build an unused pseudo count bucket for NULL menu categories.');
  }
  const webAdminCategorySortOrderIsStrict = [
    !/Number\.parseInt\(value, 10\)|parseInt\(value, 10\)/.test(webAdminControllerSource),
    /const parseSortOrder = \(value\) => \{[\s\S]*if \(value === undefined \|\| value === ''\) return 0;[\s\S]*typeof value === 'number'[\s\S]*typeof value === 'string'[\s\S]*\/\^\(0\|\[1-9\]\[0-9\]\*\)\$\/\.test\(text\) \? Number\(text\) : null;[\s\S]*return Number\.isSafeInteger\(order\) \? order : null;[\s\S]*\};/.test(webAdminControllerSource),
    /const normalizeRequiredFormText = \(value\) => \{[\s\S]*if \(typeof value !== 'string'\) return null;[\s\S]*const text = value\.trim\(\);[\s\S]*return text \|\| null;[\s\S]*\};/.test(webAdminControllerSource),
    /const body = getRequestBody\(req\);[\s\S]*const name = normalizeRequiredFormText\(body\.name\);[\s\S]*const sortOrder = parseSortOrder\(body\.sortOrder \?\? body\.sort_order\);[\s\S]*if \(!name \|\| sortOrder === null\) \{[\s\S]*카테고리명과 0 이상의 정렬 순서가 필요합니다/.test(webAdminControllerSource),
    /Category\.create\(\{[\s\S]*name,[\s\S]*sort_order:\s*sortOrder[\s\S]*\}\)/.test(webAdminControllerSource),
    /if \(!id \|\| !name \|\| sortOrder === null\) \{[\s\S]*유효한 카테고리 ID, 이름, 0 이상의 정렬 순서가 필요합니다/.test(webAdminControllerSource),
    /Category\.updateById\(id, \{[\s\S]*name,[\s\S]*sort_order:\s*sortOrder[\s\S]*\}\)/.test(webAdminControllerSource)
  ].every(Boolean);
  if (!webAdminCategorySortOrderIsStrict) {
    throw new Error('Web admin category create/update must strictly normalize non-negative sortOrder values before DB writes.');
  }
  if (!/X-CSRF-Token/.test(orderSource) || !/getCsrfToken/.test(orderSource)) {
    throw new Error('Admin order fetch POST requests must send X-CSRF-Token.');
  }
  if (/querySelector\('meta\[name="csrf-token"\]'\)\?\.getAttribute\('content'\)\s*\|\|\s*''/.test(orderSource)) {
    throw new Error('Admin order fetch code must not fallback the CSRF meta token that admin layout always provides.');
  }
  if (/isAvailable:\s*menu\.status\s*===\s*'FOR_SALE'/.test(webAdminControllerSource) || /menu\.isAvailable/.test(menuSource)) {
    throw new Error('Web admin menus view model must not keep unused isAvailable aliases; EJS uses menu.status directly.');
  }
  if (!/description:\s*menu\.description\s*\|\|\s*''/.test(webAdminControllerSource) || !/imageUrl:\s*menu\.image_url\s*\|\|\s*''/.test(webAdminControllerSource)) {
    throw new Error('Web admin menus view model must normalize optional text fields before rendering.');
  }
  if (/menu\.(?:description|imageUrl)\s*\|\|\s*''/.test(menuSource)) {
    throw new Error('Web admin menus template must not fallback optional text fields already normalized by the view model.');
  }
  if (
    /String\(category\.id\)\s*===\s*String\(menu\.categoryId\)/.test(menuSource) ||
    !/category\.id === menu\.categoryId \? 'selected' : ''/.test(menuSource)
  ) {
    throw new Error('Web admin menus template must compare numeric category IDs directly instead of coercing controller-provided IDs to strings.');
  }
  const formatOrderBlock = (webAdminControllerSource.match(/const formatOrder = \(order\) => \{[\s\S]*?\n\};/) || [''])[0];
  if (/formatMoney\b/.test(webAdminControllerSource) || /Number\([^)]*\|\| 0\)/.test(webAdminControllerSource)) {
    throw new Error('Web admin view models must not keep a no-op money formatter or fallback model-provided numeric fields to zero.');
  }
  if (/const formatOrderItems\s*=|formatOrderItems\(/.test(webAdminControllerSource)) {
    throw new Error('Web admin orders view model must not keep a single-use formatOrderItems helper; item normalization belongs in formatOrder.');
  }
  if (!/webAdmin\.controller`의 `formatOrderItems\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the web admin formatOrderItems helper removal.');
  }
  const formatOrderItemMappingBlock = (formatOrderBlock.match(/const items = parsedItems\.map\(item => \{[\s\S]*?\n  \}\);/) || [''])[0];
  if (/^\s+(id|menuId|pricePerItem):/m.test(formatOrderItemMappingBlock) || /^\s*updatedAt:\s*order/m.test(formatOrderBlock)) {
    throw new Error('Web admin orders view model must not expose unused order/item fields.');
  }
  if (/if \(!items\) return \[\];|\.filter\(Boolean\)/.test(formatOrderBlock) || !formatOrderItemMappingBlock) {
    throw new Error('Web admin order item formatter must not keep missing-item guards after Order.getAll/Order.findById supply normalized items.');
  }
  if (/item\.price\s*\?\?/.test(formatOrderItemMappingBlock) || !/price:\s*Number\(pricePerItem \* item\.quantity\)/.test(formatOrderItemMappingBlock)) {
    throw new Error('Web admin order item formatter must compute price from the Order model pricePerItem/price_per_item fields, not unsupported item.price fallback data.');
  }
  if (/order\.totalPrice\s*\?\?|order\.createdAt\s*\?\?/.test(formatOrderBlock)) {
    throw new Error('Web admin order formatter must not fallback top-level camelCase fields; Order model returns snake_case DB fields.');
  }
  if (!/totalPrice:\s*Number\(order\.total_price\)/.test(formatOrderBlock) || !/createdAt:\s*order\.created_at/.test(formatOrderBlock)) {
    throw new Error('Web admin order formatter must consume the top-level snake_case fields returned by Order model methods.');
  }
  if (!/const orders = orderRows\.map\(formatOrder\)/.test(webAdminControllerSource) || !/return \{[\s\S]*items[\s\S]*\};/.test(formatOrderBlock)) {
    throw new Error('Web admin orders controller must render normalized order and item arrays.');
  }
  const getOrdersBlock = (webAdminControllerSource.match(/const getOrders = async \(req, res\) => \{[\s\S]*?\n\};/) || [''])[0];
  const orderRenderBlock = (getOrdersBlock.match(/res\.render\('admin\/orders', \{[\s\S]*?\n    \}\);/) || [''])[0];
  if (/^\s*(?:page|totalPages|limit)(?:,|:)/m.test(orderRenderBlock)) {
    throw new Error('Web admin orders render locals must not expose unused page/totalPages/limit view-model fields; the template only consumes orders and status.');
  }
  if (/orders\s*&&\s*orders\.length|order\.items\s*&&\s*order\.items\.length|order\.items\.length\s*>\s*0|주문 내역 없음|order\.createdAt\s*\?/.test(orderSource)) {
    throw new Error('Web admin orders template must not fallback fields normalized by its controller.');
  }
  if (
    /filters\.status\.toUpperCase\(\)/.test(orderModelSource) ||
    !/const ORDER_STATUSES = \['RECEIVED', 'PREPARING', 'COMPLETED', 'CANCELLED'\];/.test(orderModelSource) ||
    !/const normalizedStatus = typeof filters\.status === 'string' \? filters\.status\.trim\(\)\.toUpperCase\(\) : '';[\s\S]*if \(normalizedStatus && !ORDER_STATUSES\.includes\(normalizedStatus\)\) \{[\s\S]*throw new Error\(`status must be one of: \$\{ORDER_STATUSES\.join\(', '\)\}`\);[\s\S]*const connection = await sql\.getConnection\(\);[\s\S]*if \(normalizedStatus\) \{[\s\S]*conditions\.push\("o\.status = \?"\);[\s\S]*params\.push\(normalizedStatus\);/.test(orderModelSource)
  ) {
    throw new Error('Order.getAll must normalize and allowlist optional status filters before adding SQL conditions.');
  }
  if (
    /parseInt\(filters\.(?:limit|offset), 10\)/.test(orderModelSource) ||
    !/const MAX_ORDER_LIST_LIMIT = 200;/.test(orderModelSource) ||
    !/const MAX_ORDER_LIST_OFFSET = 10000;/.test(orderModelSource) ||
    !/const normalizedLimit = typeof filters\.limit === 'number'[\s\S]*Number\.isSafeInteger\(normalizedLimit\) && normalizedLimit > 0[\s\S]*query \+= ` LIMIT \$\{Math\.min\(normalizedLimit, MAX_ORDER_LIST_LIMIT\)\}`;[\s\S]*const normalizedOffset = typeof filters\.offset === 'number'[\s\S]*Number\.isSafeInteger\(normalizedOffset\) && normalizedOffset >= 0[\s\S]*query \+= ` OFFSET \$\{Math\.min\(normalizedOffset, MAX_ORDER_LIST_OFFSET\)\}`;/.test(orderModelSource)
  ) {
    throw new Error('Order.getAll must inline only bounded strict safe integer LIMIT/OFFSET values.');
  }
  const orderLimitClampSmoke = `
const Module = require('module');
const originalLoad = Module._load;
let capturedQuery = '';
Module._load = (request, parent, isMain) => {
  if (request === './db.js' && parent && String(parent.filename).endsWith('src/models/order.model.js')) {
    return {
      getConnection: async () => ({
        execute: async (query) => {
          capturedQuery = query;
          return [[]];
        },
        release: () => {}
      })
    };
  }
  return originalLoad(request, parent, isMain);
};
(async () => {
  const Order = require('./src/models/order.model.js');
  await Order.getAll({ limit: '999999', offset: '999999999' });
  if (!/LIMIT 200 OFFSET 10000/.test(capturedQuery)) {
    throw new Error('Order.getAll did not clamp list LIMIT/OFFSET: ' + capturedQuery);
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;
  const orderLimitClampResult = spawnSync(process.execPath, ['-e', orderLimitClampSmoke], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 10000
  });
  if (orderLimitClampResult.status !== 0) {
    throw new Error(`Order.getAll should clamp oversized LIMIT/OFFSET before SQL execution:\n${orderLimitClampResult.stdout}\n${orderLimitClampResult.stderr}`);
  }
  const orderModelUsesStrictDateFilters = [
    /const parseDateFilter = \(value, fieldName\) => \{[\s\S]*if \(value === undefined \|\| value === null \|\| value === ''\) return null;[\s\S]*if \(typeof value !== 'string'\)[\s\S]*\/\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\$\/\.test\(text\)[\s\S]*new Date\(Date\.UTC\(year, month - 1, day\)\)[\s\S]*return text;[\s\S]*\};/.test(orderModelSource),
    /const startDate = parseDateFilter\(filters\.startDate, 'startDate'\);[\s\S]*const endDate = parseDateFilter\(filters\.endDate, 'endDate'\);[\s\S]*endDate must not be before startDate/.test(orderModelSource),
    /if \(startDate\) \{[\s\S]*conditions\.push\("o\.created_at >= \?"\);[\s\S]*params\.push\(startDate\);[\s\S]*if \(endDate\) \{[\s\S]*conditions\.push\("o\.created_at <= \?"\);[\s\S]*params\.push\(endDate\);/.test(orderModelSource)
  ].every(Boolean);
  if (/params\.push\(filters\.(?:startDate|endDate)\)/.test(orderModelSource) || !orderModelUsesStrictDateFilters) {
    throw new Error('Order.getAll must strictly validate date filters before adding SQL conditions.');
  }
  if (
    /parseInt\(req\.query\.(?:limit|offset)\)/.test(adminOrderControllerSource) ||
    !/const MAX_ORDER_LIST_LIMIT = 200;/.test(adminOrderControllerSource) ||
    !/const MAX_ORDER_LIST_OFFSET = 10000;/.test(adminOrderControllerSource) ||
    !/const rawLimit = typeof req\.query\.limit === 'string' \? req\.query\.limit\.trim\(\) : '';[\s\S]*const parsedLimit = \/\^\[1-9\]\[0-9\]\*\$\/\.test\(rawLimit\) \? Number\(rawLimit\) : null;[\s\S]*limit:\s*Number\.isSafeInteger\(parsedLimit\) && parsedLimit > 0 \? Math\.min\(parsedLimit, MAX_ORDER_LIST_LIMIT\) : 50,[\s\S]*offset:\s*Number\.isSafeInteger\(parsedOffset\) && parsedOffset >= 0 \? Math\.min\(parsedOffset, MAX_ORDER_LIST_OFFSET\) : 0/.test(adminOrderControllerSource)
  ) {
    throw new Error('Admin order API must strictly normalize and bound limit/offset query values before calling Order.getAll.');
  }
  if (/Object\.keys\(filters\)|delete filters\[key\]/.test(adminOrderControllerSource)) {
    throw new Error('Admin order API must not keep a generic filter cleanup loop; Order.getAll owns optional filter normalization.');
  }
  const adminOrderListOpenApiBlock = (adminOrderRoutesSource.match(/\/api\/admin\/orders:[\s\S]*?\n \*\/\n\n\/\*\*/) || [''])[0];
  if (!/name:\s*limit[\s\S]*default:\s*50[\s\S]*maximum:\s*200/.test(adminOrderListOpenApiBlock) || !/name:\s*offset[\s\S]*default:\s*0[\s\S]*maximum:\s*10000/.test(adminOrderListOpenApiBlock)) {
    throw new Error('Admin order list OpenAPI must document bounded limit/offset query parameters.');
  }
  if (
    /limit:\s*req\.query\.limit|parseInt\(req\.query\.limit/.test(adminKioskStatusControllerSource) ||
    !/const rawLimit = typeof req\.query\.limit === 'string' \? req\.query\.limit\.trim\(\) : '';[\s\S]*const parsedLimit = \/\^\[1-9\]\[0-9\]\*\$\/\.test\(rawLimit\) \? Number\(rawLimit\) : null;[\s\S]*const limit = Number\.isSafeInteger\(parsedLimit\) && parsedLimit > 0 \? Math\.min\(parsedLimit, 500\) : 100;[\s\S]*KioskStatus\.getAll\(\{ limit \}\)/.test(adminKioskStatusControllerSource)
  ) {
    throw new Error('Kiosk status admin API must normalize query limit before calling KioskStatus.getAll.');
  }
  const adminOrderControllerUsesStrictDateFilters = [
    /const parseDateRange = \(query\) => \{[\s\S]*parseDateFilter\(query\.startDate\)[\s\S]*parseDateFilter\(query\.endDate\)[\s\S]*종료 날짜는 시작 날짜보다 빠를 수 없습니다/.test(adminOrderControllerSource),
    /const dateRange = parseDateRange\(req\.query\);[\s\S]*if \(dateRange\.error\) \{[\s\S]*return res\.status\(400\)\.json\(\{[\s\S]*message: dateRange\.error/.test(adminOrderControllerSource),
    /startDate:\s*dateRange\.startDate,[\s\S]*endDate:\s*dateRange\.endDate/.test(adminOrderControllerSource)
  ].every(Boolean);
  if (/startDate:\s*req\.query\.startDate|endDate:\s*req\.query\.endDate|Date\.parse|isNaN\(/.test(adminOrderControllerSource) || !adminOrderControllerUsesStrictDateFilters) {
    throw new Error('Admin order API must strictly validate startDate/endDate before calling Order.getAll.');
  }
  const adminOrderStatusFilterIsStrict = [
    /const ORDER_STATUSES = \['RECEIVED', 'PREPARING', 'COMPLETED', 'CANCELLED'\];/.test(adminOrderControllerSource),
    /const parseOrderStatusFilter = \(value\) => \{[\s\S]*if \(value === undefined \|\| value === ''\) return \{ value: undefined \};[\s\S]*if \(typeof value !== 'string'\)[\s\S]*const status = value\.trim\(\)\.toUpperCase\(\);[\s\S]*if \(!ORDER_STATUSES\.includes\(status\)\)[\s\S]*return \{ value: status \};[\s\S]*\};/.test(adminOrderControllerSource),
    /const statusFilter = parseOrderStatusFilter\(req\.query\.status\);[\s\S]*return res\.status\(400\)\.json\(\{[\s\S]*message: statusFilter\.error[\s\S]*status:\s*statusFilter\.value/.test(adminOrderControllerSource)
  ].every(Boolean);
  if (/status:\s*req\.query\.status/.test(adminOrderControllerSource) || !adminOrderStatusFilterIsStrict) {
    throw new Error('Admin order API must allowlist status query filters before calling Order.getAll.');
  }
  if (
    /parseInt\(req\.query\.(?:page|limit)\)/.test(webAdminControllerSource) ||
    !/const MAX_ORDER_LIST_LIMIT = 200;/.test(webAdminControllerSource) ||
    !/const MAX_ORDER_LIST_OFFSET = 10000;/.test(webAdminControllerSource) ||
    !/const rawPage = typeof req\.query\.page === 'string' \? req\.query\.page\.trim\(\) : '';[\s\S]*const page = Number\.isSafeInteger\(parsedPage\) && parsedPage > 0 \? parsedPage : 1;[\s\S]*const rawLimit = typeof req\.query\.limit === 'string' \? req\.query\.limit\.trim\(\) : '';[\s\S]*const limit = Number\.isSafeInteger\(parsedLimit\) && parsedLimit > 0 \? Math\.min\(parsedLimit, MAX_ORDER_LIST_LIMIT\) : 20;[\s\S]*const offset = Math\.min\(\(page - 1\) \* limit, MAX_ORDER_LIST_OFFSET\);/.test(getOrdersBlock)
  ) {
    throw new Error('Web admin orders page must strictly normalize and bound page/limit query values before calculating offset.');
  }
  const webAdminOrdersUseStrictDateFilters = [
    /const parseDateRange = \(query, startKey, endKey\) => \{[\s\S]*parseDateFilter\(query\[startKey\]\)[\s\S]*parseDateFilter\(query\[endKey\]\)[\s\S]*종료 날짜는 시작 날짜보다 빠를 수 없습니다/.test(webAdminControllerSource),
    /const dateRange = parseDateRange\(req\.query, 'dateFrom', 'dateTo'\);[\s\S]*req\.flash\('error', dateRange\.error\);[\s\S]*return res\.redirect\('\/admin\/orders'\);/.test(getOrdersBlock),
    /startDate:\s*dateRange\.startDate,[\s\S]*endDate:\s*dateRange\.endDate/.test(getOrdersBlock),
    /dateFrom:\s*dateRange\.startDate \|\| '',[\s\S]*dateTo:\s*dateRange\.endDate \|\| ''/.test(getOrdersBlock),
    /name="dateFrom" value="<%= dateFrom %>"/.test(orderSource),
    /name="dateTo" value="<%= dateTo %>"/.test(orderSource)
  ].every(Boolean);
  if (/startDate:\s*req\.query\.dateFrom|endDate:\s*req\.query\.dateTo|Date\.parse|isNaN\(/.test(getOrdersBlock) || !webAdminOrdersUseStrictDateFilters) {
    throw new Error('Web admin orders page must strictly validate dateFrom/dateTo before calling Order.getAll.');
  }
  const webAdminOrderStatusFilterIsStrict = [
    /const ORDER_STATUSES = \['RECEIVED', 'PREPARING', 'COMPLETED', 'CANCELLED'\];/.test(webAdminControllerSource),
    /const parseOrderStatusFilter = \(value\) => \{[\s\S]*if \(value === undefined \|\| value === ''\) return \{ value: '' \};[\s\S]*if \(typeof value !== 'string'\)[\s\S]*const status = value\.trim\(\)\.toUpperCase\(\);[\s\S]*if \(!ORDER_STATUSES\.includes\(status\)\)[\s\S]*return \{ value: status \};[\s\S]*\};/.test(webAdminControllerSource),
    /const statusFilter = parseOrderStatusFilter\(req\.query\.status\);[\s\S]*req\.flash\('error', statusFilter\.error\);[\s\S]*return res\.redirect\('\/admin\/orders'\);[\s\S]*const status = statusFilter\.value;/.test(getOrdersBlock)
  ].every(Boolean);
  if (/const status = req\.query\.status \|\| '';/.test(getOrdersBlock) || !webAdminOrderStatusFilterIsStrict) {
    throw new Error('Web admin orders page must allowlist status query filters before calling Order.getAll.');
  }
  const adminOrderUsesStrictId = [
    /const parseOrderId = \(value\) => \{[\s\S]*typeof value === 'number'[\s\S]*typeof value === 'string' \? value\.trim\(\) : ''[\s\S]*\/\^\[1-9\]\[0-9\]\*\$\/\.test\(text\) \? Number\(text\) : null;[\s\S]*return Number\.isSafeInteger\(parsed\) \? parsed : null;[\s\S]*\};/.test(adminOrderControllerSource),
    /const orderId = parseOrderId\(req\.params\.orderId\);[\s\S]*if \(orderId === null\)/.test(adminOrderControllerSource),
    /Order\.findById\(orderId\)/.test(adminOrderControllerSource),
    /Order\.updateStatus\(orderId, status\)/.test(adminOrderControllerSource),
    /Order\.cancel\(orderId\)/.test(adminOrderControllerSource)
  ].every(Boolean);
  const webAdminOrderUsesStrictId = [
    /const parseId = \(value\) => \{[\s\S]*\/\^\[1-9\]\[0-9\]\*\$\/\.test\(text\) \? Number\(text\) : null;[\s\S]*return Number\.isSafeInteger\(id\) \? id : null;[\s\S]*\};/.test(webAdminControllerSource),
    /const getOrderJson = async \(req, res\) => \{[\s\S]*const orderId = parseId\(req\.params\.orderId\);[\s\S]*if \(orderId === null\)[\s\S]*Order\.findById\(orderId\)/.test(webAdminControllerSource),
    /const postOrderStatus = async \(req, res\) => \{[\s\S]*const orderId = parseId\(req\.params\.orderId\);[\s\S]*if \(orderId === null\)[\s\S]*Order\.updateStatus\(orderId, req\.body\.status\)/.test(webAdminControllerSource),
    /const postOrderCancel = async \(req, res\) => \{[\s\S]*const orderId = parseId\(req\.params\.orderId\);[\s\S]*if \(orderId === null\)[\s\S]*Order\.cancel\(orderId\)/.test(webAdminControllerSource)
  ].every(Boolean);
  if (
    /parseInt\(req\.params\.orderId, 10\)|String\(value \|\| ''\)/.test(`${adminOrderControllerSource}\n${webAdminControllerSource}`) ||
    !adminOrderUsesStrictId ||
    !webAdminOrderUsesStrictId
  ) {
    throw new Error('Admin order controllers must strictly normalize orderId route params before querying or mutating orders.');
  }
  if (
    /function applyFilter\(|new FormData\(form\)|new URLSearchParams\(formData\)/.test(orderSource) ||
    !/<form id="filterForm" method="get" action="\/admin\/orders">/.test(orderSource) ||
    !/<button type="submit" class="btn btn-primary" form="filterForm">필터 적용<\/button>/.test(orderSource)
  ) {
    throw new Error('Web admin order filters must use native GET form submit instead of a single-use applyFilter wrapper.');
  }
  if (/overview\.[a-z_]+ \|\| 0|category\.[a-z_]+ \|\| 0|dailySales \|\| \[\]|topSellingMenus \|\| \[\]|daily_sales \|\| 0|total_quantity \|\| 0/.test(statisticsSource)) {
    throw new Error('Web admin statistics rendering must not fallback numeric fields already provided by Statistics model aggregates.');
  }
  const getStatisticsBlock = (webAdminControllerSource.match(/const getStatistics = async \(req, res\) => \{[\s\S]*?\n\};/) || [''])[0];
  if (/Number\(overview\.|Number\(category\.|Number\(item\.(?:daily_sales|total_quantity)\)/.test(statisticsSource)) {
    throw new Error('Web admin statistics view must not re-coerce numeric fields already normalized by getStatistics().');
  }
  if (
    !/const statisticsOverview = \{[\s\S]*total_sales:\s*Number\(overview\.total_sales\),[\s\S]*total_orders:\s*Number\(overview\.total_orders\),[\s\S]*average_order_value:\s*Number\(overview\.average_order_value\),[\s\S]*pending_orders:\s*Number\(overview\.pending_orders\),[\s\S]*preparing_orders:\s*Number\(overview\.preparing_orders\)[\s\S]*\};/.test(getStatisticsBlock) ||
    !/const statisticsDailySales = dailySales\.slice\(0,\s*7\)\.map\(day => \(\{[\s\S]*sale_date:\s*day\.sale_date,[\s\S]*daily_sales:\s*Number\(day\.daily_sales\)[\s\S]*\}\)\);/.test(getStatisticsBlock) ||
    !/const statisticsTopSellingMenus = topSellingMenus\.map\(menu => \(\{[\s\S]*menu_name:\s*menu\.menu_name,[\s\S]*total_quantity:\s*Number\(menu\.total_quantity\)[\s\S]*\}\)\);/.test(getStatisticsBlock) ||
    !/const statisticsCategoryStats = categoryStats\.map\(category => \(\{[\s\S]*category_name:\s*category\.category_name,[\s\S]*order_count:\s*Number\(category\.order_count\),[\s\S]*total_quantity:\s*Number\(category\.total_quantity\),[\s\S]*category_revenue:\s*Number\(category\.category_revenue\)[\s\S]*\}\)\);/.test(getStatisticsBlock) ||
    !/overview:\s*statisticsOverview,[\s\S]*dailySales:\s*statisticsDailySales,[\s\S]*topSellingMenus:\s*statisticsTopSellingMenus,[\s\S]*categoryStats:\s*statisticsCategoryStats/.test(getStatisticsBlock)
  ) {
    throw new Error('Web admin statistics controller must normalize numeric view-model fields before rendering.');
  }
  if (/hourlyAnalysis:|Statistics\.getDashboardStats\(req\.query\.startDate/.test(getStatisticsBlock)) {
    throw new Error('Web admin statistics page must not query or pass unused hourlyAnalysis view-model data.');
  }
  const webAdminStatisticsUseStrictDateFilters = [
    /const dateRange = parseDateRange\(req\.query, 'startDate', 'endDate'\);[\s\S]*req\.flash\('error', dateRange\.error\);[\s\S]*return res\.redirect\('\/admin\/statistics'\);/.test(getStatisticsBlock),
    /const \{ startDate, endDate \} = dateRange;/.test(getStatisticsBlock),
    /Statistics\.getSalesStatistics\(startDate, endDate\)/.test(getStatisticsBlock),
    /Statistics\.getTopSellingMenus\(5, startDate, endDate\)/.test(getStatisticsBlock),
    /Statistics\.getDailySales\(startDate, endDate\)/.test(getStatisticsBlock),
    /Statistics\.getCategorySales\(startDate, endDate\)/.test(getStatisticsBlock),
    /startDate:\s*startDate \|\| '',[\s\S]*endDate:\s*endDate \|\| ''/.test(getStatisticsBlock),
    /<form class="row g-3 align-items-end mb-4" method="get" action="\/admin\/statistics">/.test(statisticsSource),
    /name="startDate" value="<%= startDate %>"/.test(statisticsSource),
    /name="endDate" value="<%= endDate %>"/.test(statisticsSource)
  ].every(Boolean);
  if (/const \{ startDate, endDate \} = req\.query|Date\.parse|isNaN\(/.test(getStatisticsBlock) || !webAdminStatisticsUseStrictDateFilters) {
    throw new Error('Web admin statistics page must strictly validate startDate/endDate and retain filter input values.');
  }
  if (/item\.price \|\| 0|item\.quantity \|\| 0|order(?:Detail)?\.totalPrice \|\| 0|orderData\.totalPrice \|\| 0/.test(`${orderSource}\n${dashboardSource}\n${adminJsSource}`)) {
    throw new Error('Web admin order rendering must not fallback order price/quantity fields already provided by the view model or socket payload.');
  }
  const updateOrderStatusBlock = (orderSource.match(/function updateOrderStatus\(orderId, newStatus\) \{[\s\S]*?\n\}\n\n\/\/ 주문 취소/) || [''])[0];
  if (/statusTexts|statusColors|statusBadge|updateOrderCounts\(\);/.test(updateOrderStatusBlock)) {
    throw new Error('Web admin order status fetch success path must not update DOM counters immediately before location.reload().');
  }
  if (/forEach\(function\(item,\s*index\)/.test(orderSource) || /window\.addEventListener\('error', function\(event\)/.test(adminJsSource)) {
    throw new Error('Web admin browser code must not keep unused callback parameters.');
  }
  if (/\b(?:no-gutters|mr-[0-5]|ml-[0-5])\b/.test(`${dashboardSource}\n${orderSource}\n${statisticsSource}\n${categorySource}\n${menuSource}\n${loginSource}\n${navbarSource}\n${layoutSource}`)) {
    throw new Error('Web admin views must not keep stale Bootstrap 4 grid or directional spacing utility classes.');
  }
  if (
    /function\s+(?:refreshData|refreshOrders|printOrderReceipt)\s*\(/.test(`${dashboardSource}\n${orderSource}`) ||
    !/onclick="location\.reload\(\)"/.test(dashboardSource) ||
    !/onclick="location\.reload\(\)"/.test(orderSource) ||
    !/onclick="window\.print\(\)"/.test(orderSource)
  ) {
    throw new Error('Web admin browser code must not keep no-op wrappers around location.reload() or window.print().');
  }
  if (/const statusBadge = row\.querySelector\('\[id\^="status-"\]'\);\s*if \(statusBadge\)/.test(orderSource)) {
    throw new Error('Web admin order count refresh must not null-guard status badges that every data-order-id row renders.');
  }
  if (
    /todayStatistics\.(?:totalSales|averageOrderValue)\s*\?|order\.createdAt\s*\?/.test(dashboardSource) ||
    /todayStatistics\.orderCount\s*\|\| 0|pendingOrdersCount\s*\|\| 0/.test(dashboardSource) ||
    /recentOrders\s*&&|salesChartData\s*\|\| \[\]|popularMenuData\s*\|\| \[\]/.test(dashboardSource) ||
    /id=["'](?:todaySales|todayOrders|avgOrderValue)["']/.test(dashboardSource) ||
    /kioskStatusSummary\s*\|\||kioskStatus\.(?:online|total|degraded|maintenance|offline)\s*\|\| 0|const\s+kioskStatus\s*=\s*kioskStatusSummary/.test(dashboardSource) ||
    /event\.detail\s*\|\|\s*\{\}/.test(dashboardSource) ||
    /data\.status === 'COMPLETED'/.test(dashboardSource)
  ) {
    throw new Error('Web admin dashboard must not fallback or alias fields already provided by getDashboard() and KioskStatus.getSummary().');
  }
  if (
    !/data-empty-state="recent-orders"[\s\S]*최근 주문이 없습니다/.test(dashboardSource) ||
    !/const emptyRow = tableBody\.querySelector\('\[data-empty-state="recent-orders"\]'\);[\s\S]*if \(emptyRow\) \{[\s\S]*emptyRow\.remove\(\);[\s\S]*tableBody\.insertAdjacentHTML\('afterbegin', newRow\);/.test(dashboardSource)
  ) {
    throw new Error('Web admin dashboard must remove the recent-orders empty-state placeholder before inserting realtime new-order rows.');
  }
  const getDashboardBlock = (webAdminControllerSource.match(/const getDashboard = async \(req, res\) => \{[\s\S]*?\n\};/) || [''])[0];
  if (
    (getDashboardBlock.match(/Statistics\.getSalesStatistics\(startDate, endDate\)/g) || []).length !== 1 ||
    /Statistics\.getDashboardStats\(\)/.test(getDashboardBlock) ||
    !/const \[todayStats, dailySales, topSellingMenus, recentOrderRows, kioskStatusSummary\] = await Promise\.all\(\[\s*Statistics\.getSalesStatistics\(startDate, endDate\),\s*Statistics\.getDailySales\(\),\s*Statistics\.getTopSellingMenus\(5\),\s*Order\.getAll\(\{ limit: 5 \}\),\s*KioskStatus\.getSummary\(\)\s*\]\);/.test(getDashboardBlock) ||
    !/const salesChartData = dailySales\s*\.slice\(0,\s*7\)\s*\.slice\(\)\s*\.reverse\(\)/.test(getDashboardBlock) ||
    !/const popularMenuData = topSellingMenus\.map\(menu => \(\{/.test(getDashboardBlock)
  ) {
    throw new Error('Web admin dashboard must fetch only the stats it renders instead of the full API dashboard aggregate.');
  }
  if (
    !/message:\s*"이미 해당 상태입니다\.",[\s\S]*previousStatus:\s*currentOrder\.status,[\s\S]*status:\s*upperStatus/.test(orderModelSource) ||
    !/previousStatus:\s*currentOrder\.status/.test(orderModelSource) ||
    !/data\.previousStatus === 'RECEIVED'/.test(dashboardSource)
  ) {
    throw new Error('Web admin dashboard pending-order realtime count must use previousStatus because pendingOrdersCount is RECEIVED-only.');
  }
  if (
    /parseInt\(pendingElement\.textContent/.test(dashboardSource) ||
    !/const formattedCount = pendingElement\.textContent\.trim\(\)\.replace\(\/\\s\+\/g, ''\)\.replace\(\/건\$\/, ''\);[\s\S]*const countText = formattedCount\.replace\(\/,\/g, ''\);[\s\S]*Number\.isSafeInteger\(parsedCount\) && parsedCount\.toLocaleString\('ko-KR'\) === formattedCount[\s\S]*\.toLocaleString\('ko-KR'\) \+ '건'/.test(dashboardSource)
  ) {
    throw new Error('Web admin dashboard pending-order realtime count must parse and write locale-formatted counts without parseInt truncation.');
  }
  if (
    /newStatus\.toUpperCase\(\)/.test(orderModelSource) ||
    !/const upperStatus = typeof newStatus === 'string' \? newStatus\.trim\(\)\.toUpperCase\(\) : '';[\s\S]*if \(!ORDER_STATUSES\.includes\(upperStatus\)\) \{[\s\S]*message: `유효하지 않은 상태입니다\. 가능한 상태: \$\{ORDER_STATUSES\.join\(', '\)\}`[\s\S]*const connection = await sql\.getConnection\(\);/.test(orderModelSource)
  ) {
    throw new Error('Order.updateStatus must validate normalized string status before acquiring a DB connection.');
  }
  const orderModelUsesStrictId = [
    /const parsePositiveInteger = \(value\) => \{[\s\S]*typeof value === 'number'[\s\S]*typeof value === 'string' \? value\.trim\(\) : ''[\s\S]*\/\^\[1-9\]\[0-9\]\*\$\/\.test\(text\) \? Number\(text\) : null;[\s\S]*return Number\.isSafeInteger\(parsed\) \? parsed : null;[\s\S]*\};/.test(orderModelSource),
    /Order\.findById = async \(orderId\) => \{[\s\S]*const normalizedOrderId = parsePositiveInteger\(orderId\);[\s\S]*if \(normalizedOrderId === null\) \{[\s\S]*return null;[\s\S]*const connection = await sql\.getConnection\(\);[\s\S]*\[normalizedOrderId\]/.test(orderModelSource),
    /Order\.cancel = async \(orderId\) => \{[\s\S]*const normalizedOrderId = parsePositiveInteger\(orderId\);[\s\S]*if \(normalizedOrderId === null\) \{[\s\S]*return \{ success: false, message: "주문을 찾을 수 없습니다\." \};[\s\S]*\[normalizedOrderId\][\s\S]*orderId:\s*currentOrder\.id/.test(orderModelSource),
    /Order\.updateStatus = async \(orderId, newStatus\) => \{[\s\S]*const normalizedOrderId = parsePositiveInteger\(orderId\);[\s\S]*if \(normalizedOrderId === null\) \{[\s\S]*return \{ success: false, message: "주문을 찾을 수 없습니다\." \};[\s\S]*\[normalizedOrderId\][\s\S]*\[upperStatus, normalizedOrderId\][\s\S]*orderId:\s*currentOrder\.id/.test(orderModelSource)
  ].every(Boolean);
  if (/orderId:\s*parseInt\(orderId\)|String\(value \|\| ''\)/.test(orderModelSource) || !orderModelUsesStrictId) {
    throw new Error('Order model must strictly normalize order IDs before DB access and return DB row IDs in status payloads.');
  }
  if (/todayStats\.(?:total_orders|pending_orders)\s*\|\| 0|menu\.total_quantity\s*\|\| 0/.test(webAdminControllerSource)) {
    throw new Error('Web admin dashboard controller must not fallback non-null Statistics aggregates.');
  }
  const webAdminMenuPriceIsStrict = [
    !/const parsePrice\s*=|parsePrice\(|const parseNonNegativePrice\s*=|parseNonNegativePrice\(|const getTodayRange\s*=|getTodayRange\(|Number\.parseFloat\(body\.price\)/.test(webAdminControllerSource),
    /const priceText = typeof body\.price === 'number'[\s\S]*\? String\(body\.price\)[\s\S]*: \(typeof body\.price === 'string' \? body\.price\.trim\(\) : ''\);/.test(webAdminControllerSource),
    webAdminControllerSource.includes("const matchedPrice = /^(0|[1-9][0-9]*)(\\.[0-9]+)?$/.test(priceText) ? Number(priceText) : null;"),
    /const price = Number\.isFinite\(matchedPrice\) \? matchedPrice : null;/.test(webAdminControllerSource),
    /const start = new Date\(\);[\s\S]*start\.setHours\(0, 0, 0, 0\);[\s\S]*const end = new Date\(start\);[\s\S]*end\.setDate\(end\.getDate\(\) \+ 1\);/.test(webAdminControllerSource)
  ].every(Boolean);
  if (!webAdminMenuPriceIsStrict) {
    throw new Error('Web admin controller must inline strict menu price/date normalization without single-use wrappers.');
  }
  if (
    /const normalizeNullableText\s*=|normalizeNullableText\(|const parseWebMenuStatus\s*=|parseWebMenuStatus\(|const normalizeText = \(value\) => String\(value \|\| ''\)\.trim\(\);|String\(body\.(?:price|status) \|\| ''\)/.test(webAdminControllerSource) ||
    !/const INVALID_FORM_VALUE = Symbol\('invalid_form_value'\);/.test(webAdminControllerSource) ||
    !/const getRequestBody = \(req\) => \(req\.body && typeof req\.body === 'object' \? req\.body : \{\}\);/.test(webAdminControllerSource) ||
    !/const normalizeOptionalFormText = \(value\) => \{[\s\S]*if \(value === undefined \|\| value === null \|\| value === ''\) return null;[\s\S]*if \(typeof value !== 'string'\) return INVALID_FORM_VALUE;[\s\S]*return text \|\| null;[\s\S]*\};/.test(webAdminControllerSource) ||
    !/const statusValue = body\.status;[\s\S]*let status = 'FOR_SALE';[\s\S]*if \(statusValue !== undefined && statusValue !== ''\) \{[\s\S]*status = typeof statusValue === 'string' \? statusValue\.trim\(\) : null;[\s\S]*\}/.test(webAdminControllerSource) ||
    !/const imageUrl = normalizeOptionalFormText\(body\.imageUrl \?\? body\.image_url\);/.test(webAdminControllerSource) ||
    !/const description = normalizeOptionalFormText\(body\.description\);/.test(webAdminControllerSource) ||
    !/imageUrl === INVALID_FORM_VALUE[\s\S]*description === INVALID_FORM_VALUE/.test(webAdminControllerSource) ||
    !/image_url:\s*imageUrl,[\s\S]*description,[\s\S]*status/.test(webAdminControllerSource) ||
    !/getMenuPayload\(getRequestBody\(req\)\)/.test(webAdminControllerSource)
  ) {
    throw new Error('Web admin menu/category form payloads must validate string fields before DB writes without unsafe String(...) coercion.');
  }
  if (
    /const extractCsrfToken\s*=|extractCsrfToken\(/.test(e2eSource) ||
    !/const csrfTokenMatch = loginPage\.text\.match\(/.test(e2eSource) ||
    !/assert\.ok\(csrfTokenMatch, 'admin HTML should include a CSRF token'\);/.test(e2eSource) ||
    !/const csrfToken = csrfTokenMatch\[1\];[\s\S]*_csrf:\s*csrfToken/.test(e2eSource) ||
    !/cookie:\s*loginPage\.cookie/.test(e2eSource)
  ) {
    throw new Error('DB/API E2E admin session login must inline CSRF token extraction and submit it with the session cookie.');
  }
  if (
    /const assertSessionPersisted\s*=|assertSessionPersisted\(/.test(e2eSource) ||
    !/const sessionConnection = await mysql\.createConnection\(\{\s*host:\s*config\.dbHost,\s*port:\s*config\.dbPort,\s*user:\s*config\.dbUser,\s*password:\s*config\.dbPassword,\s*database:\s*config\.dbName\s*\}\);[\s\S]*const \[sessionRows\] = await sessionConnection\.execute\('SELECT COUNT\(\*\) AS count FROM Sessions'\);[\s\S]*assert\.ok\(Number\(sessionRows\[0\]\.count\) >= 1, 'admin session should be persisted in MySQL Sessions table'\);[\s\S]*await sessionConnection\.end\(\);/.test(e2eSource)
  ) {
    throw new Error('DB/API E2E must inline MySQL session persistence verification without a single-use assertSessionPersisted helper.');
  }
  if (
    /const getRawSetCookieHeader\s*=|getRawSetCookieHeader\(/.test(`${e2eSource}\n${opsSmokeSource}`) ||
    !/rawCookie:\s*typeof response\.headers\.getSetCookie === 'function'\s*\?\s*response\.headers\.getSetCookie\(\)\.join\('\\n'\)\s*:\s*response\.headers\.get\('set-cookie'\) \|\| ''/.test(opsSmokeSource) ||
    !/const rawSessionCookie = typeof sessionLogin\.response\.headers\.getSetCookie === 'function'\s*\?\s*sessionLogin\.response\.headers\.getSetCookie\(\)\.join\('\\n'\)\s*:\s*sessionLogin\.response\.headers\.get\('set-cookie'\) \|\| '';/.test(e2eSource)
  ) {
    throw new Error('Admin smoke/E2E scripts must inline raw Set-Cookie extraction without a single-use getRawSetCookieHeader helper.');
  }
  if (
    /const getCookieHeader\s*=|getCookieHeader\(/.test(e2eSource) ||
    !/cookie:\s*typeof response\.headers\.getSetCookie === 'function'\s*\?\s*response\.headers\.getSetCookie\(\)\s*\.map\(cookie => cookie\.split\(';'\)\[0\]\)\s*\.join\('; '\)\s*:\s*\(response\.headers\.get\('set-cookie'\) \? response\.headers\.get\('set-cookie'\)\.split\(';'\)\[0\] : ''\)/.test(e2eSource)
  ) {
    throw new Error('DB/API E2E must inline session cookie extraction without a single-use getCookieHeader helper.');
  }
  if (!/e2e-db-api\.js`의 `getCookieHeader\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the DB/API E2E getCookieHeader helper removal.');
  }
  if (!/e2e-db-api\.js`의 `extractCsrfToken\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the DB/API E2E extractCsrfToken helper removal.');
  }
  if (!/e2e-db-api\.js`의 `assertSessionPersisted\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document the DB/API E2E assertSessionPersisted helper removal.');
  }
  if (!/CSRF 방지/.test(readmeSource)) {
    throw new Error('README.md must document EJS admin CSRF protection.');
  }

  console.log('ok web admin CSRF contract');
};

const verifyAuthFailureLogging = () => {
  const adminControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/admin.controller.js'), 'utf8');
  const webAdminControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/webAdmin.controller.js'), 'utf8');
  const adminModelSource = fs.readFileSync(path.join(rootDir, 'src/models/admin.model.js'), 'utf8');
  const errorMiddlewareSource = fs.readFileSync(path.join(rootDir, 'src/middleware/error.middleware.js'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const runbookSource = fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8');
  const auditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');

  if (!/Admin API login failed/.test(adminControllerSource) || !/missing_credentials/.test(adminControllerSource) || !/invalid_credentials/.test(adminControllerSource)) {
    throw new Error('Admin API login failures must emit structured warning logs.');
  }
  if (!/Web admin login failed/.test(webAdminControllerSource) || !/missing_credentials/.test(webAdminControllerSource) || !/invalid_credentials/.test(webAdminControllerSource)) {
    throw new Error('Web admin login failures must emit structured warning logs.');
  }
  const adminLoginFailureBlocks = Array.from(
    adminControllerSource.matchAll(/logger\.logWarning\('Admin API login failed', \{[\s\S]*?\n\s*\}\);/g),
    match => match[0]
  );
  const webAdminLoginFailureBlocks = Array.from(
    webAdminControllerSource.matchAll(/logger\.logWarning\('Web admin login failed', \{[\s\S]*?\n\s*\}\);/g),
    match => match[0]
  );
  if (/const logLoginFailure\s*=|logLoginFailure\(/.test(adminControllerSource)) {
    throw new Error('Admin API login must not keep a local logLoginFailure wrapper; login failure branches own direct structured warning logs.');
  }
  if (/const logWebLoginFailure\s*=|logWebLoginFailure\(/.test(webAdminControllerSource)) {
    throw new Error('Web admin login must not keep a single-use logWebLoginFailure helper.');
  }
  if (/normalize(?:Login)?(?:Username|Password)/.test(`${adminControllerSource}\n${webAdminControllerSource}`)) {
    throw new Error('Admin login paths must not keep single-use credential normalizer wrappers; inline string-only normalization in each login handler.');
  }
  if (
    adminLoginFailureBlocks.length !== 2 ||
    !adminLoginFailureBlocks.some(block => /reason:\s*'missing_credentials'/.test(block)) ||
    !adminLoginFailureBlocks.some(block => /reason:\s*'invalid_credentials'/.test(block)) ||
    webAdminLoginFailureBlocks.length !== 2 ||
    !webAdminLoginFailureBlocks.some(block => /reason:\s*'missing_credentials'/.test(block)) ||
    !webAdminLoginFailureBlocks.some(block => /reason:\s*'invalid_credentials'/.test(block)) ||
    /password/.test(`${adminLoginFailureBlocks.join('\n')}\n${webAdminLoginFailureBlocks.join('\n')}`)
  ) {
    throw new Error('Login failure warning logs must not include passwords in structured log data.');
  }
  const authInputsAreStrict = [
    /const username = typeof req\.body\?\.username === 'string' \? req\.body\.username\.trim\(\) : '';[\s\S]*const password = typeof req\.body\?\.password === 'string' \? req\.body\.password : '';[\s\S]*if \(!username \|\| !password\)/.test(adminControllerSource),
    /const username = typeof req\.body\?\.username === 'string' \? req\.body\.username\.trim\(\) : '';[\s\S]*const password = typeof req\.body\?\.password === 'string' \? req\.body\.password : '';[\s\S]*if \(!username \|\| !password\) \{[\s\S]*reason:\s*'missing_credentials'[\s\S]*return res\.redirect\('\/admin\/login'\);/.test(webAdminControllerSource),
    /Admin\.findByUsername\(username\)/.test(adminControllerSource),
    /bcrypt\.compare\(password, admin\.password\)/.test(adminControllerSource),
    /Admin\.findByUsername\(username\)/.test(webAdminControllerSource),
    /bcrypt\.compare\(password, admin\.password\)/.test(webAdminControllerSource),
    /Admin\.findByUsername = async \(username\) => \{[\s\S]*if \(typeof username !== 'string'\) \{[\s\S]*return null;[\s\S]*const normalizedUsername = username\.trim\(\);[\s\S]*if \(!normalizedUsername\) \{[\s\S]*return null;[\s\S]*\[normalizedUsername\]/.test(adminModelSource)
  ].every(Boolean);
  if (/String\(req\.body\.username \|\| ''\)|String\(username \|\| ''\)|const \{ username, password \} = req\.body/.test(`${adminControllerSource}\n${webAdminControllerSource}`) || !authInputsAreStrict) {
    throw new Error('Admin login paths must validate string credentials before DB lookup, bcrypt, or warning-log username fields.');
  }
  if (/const saveSession\s*=|saveSession\(req\)/.test(webAdminControllerSource) || !/req\.session\.admin = \{ id: admin\.id, username: admin\.username \};[\s\S]*await new Promise\(\(resolve, reject\) => \{[\s\S]*req\.session\.save\(\(error\) => \{/.test(webAdminControllerSource)) {
    throw new Error('Web admin login must not keep a single-use saveSession helper; persist the session directly in postLogin.');
  }
  if (!/admin\.controller`의 `logLoginFailure\(\)`/.test(auditSource) || !/webAdmin\.controller`의 `logWebLoginFailure\(\)`/.test(auditSource)) {
    throw new Error('PROJECT_COMPLETENESS_AUDIT.md must document admin API and web admin login warning helper removals.');
  }
  if (
    /const handleJWT(?:Expired)?Error\s*=|handleJWT(?:Expired)?Error\(/.test(errorMiddlewareSource) ||
    !/if \(err\.name === 'JsonWebTokenError'\) \{\s*error = new AppError\('유효하지 않은 토큰입니다\. 다시 로그인해주세요\.', 401\);\s*\}/.test(errorMiddlewareSource) ||
    !/if \(err\.name === 'TokenExpiredError'\) \{\s*error = new AppError\('토큰이 만료되었습니다\. 다시 로그인해주세요\.', 401\);\s*\}/.test(errorMiddlewareSource)
  ) {
    throw new Error('Global error middleware must inline JWT error conversion without single-use handleJWTError helpers.');
  }
  if (
    /const handleValidationError\s*=|handleValidationError\(/.test(errorMiddlewareSource) ||
    !/if \(err\.name === 'ValidationError'\) \{\s*const errors = Object\.values\(error\.errors\)\.map\(el => el\.message\);\s*error = new AppError\(`입력 데이터가 올바르지 않습니다: \$\{errors\.join\('\. '\)\}`, 400\);\s*\}/.test(errorMiddlewareSource)
  ) {
    throw new Error('Global error middleware must inline ValidationError conversion without a single-use handleValidationError helper.');
  }
  if (
    /const handleMulterError\s*=|handleMulterError\(/.test(errorMiddlewareSource) ||
    !/if \(err\.code && err\.code\.startsWith\('LIMIT_'\)\) \{[\s\S]*let message = '파일 업로드 중 오류가 발생했습니다\.';[\s\S]*switch \(err\.code\) \{[\s\S]*case 'LIMIT_FILE_SIZE':[\s\S]*message = '파일 크기가 너무 큽니다\. 5MB 이하의 파일만 업로드 가능합니다\.';[\s\S]*case 'LIMIT_FILE_COUNT':[\s\S]*message = '업로드 파일 개수가 제한을 초과했습니다\.';[\s\S]*case 'LIMIT_UNEXPECTED_FILE':[\s\S]*message = '허용되지 않는 파일 필드입니다\.';[\s\S]*error = new AppError\(message, 400\);[\s\S]*\}/.test(errorMiddlewareSource)
  ) {
    throw new Error('Global error middleware must inline Multer LIMIT_* conversion without a single-use handleMulterError helper.');
  }
  if (
    /const handleMySQLError\s*=|handleMySQLError\(/.test(errorMiddlewareSource) ||
    !/if \(err\.code\) \{[\s\S]*let message = '데이터베이스 오류가 발생했습니다\.';[\s\S]*switch \(err\.code\) \{[\s\S]*case 'ER_DUP_ENTRY':[\s\S]*message = '이미 존재하는 데이터입니다\.';[\s\S]*case 'ER_NO_REFERENCED_ROW_2':[\s\S]*message = '참조하는 데이터가 존재하지 않습니다\.';[\s\S]*case 'ER_ROW_IS_REFERENCED_2':[\s\S]*message = '다른 데이터에서 참조 중인 항목은 삭제할 수 없습니다\.';[\s\S]*case 'ER_BAD_NULL_ERROR':[\s\S]*message = '필수 입력 항목이 누락되었습니다\.';[\s\S]*case 'ER_DATA_TOO_LONG':[\s\S]*message = '입력된 데이터가 허용 길이를 초과했습니다\.';[\s\S]*case 'ECONNREFUSED':[\s\S]*message = '데이터베이스 연결에 실패했습니다\.';[\s\S]*default:[\s\S]*message = '데이터베이스 처리 중 오류가 발생했습니다\.';[\s\S]*error = new AppError\(message, 400\);[\s\S]*\}/.test(errorMiddlewareSource)
  ) {
    throw new Error('Global error middleware must inline MySQL error conversion without a single-use handleMySQLError helper.');
  }
  if (
    /const sendError(?:Dev|Prod)\s*=|sendError(?:Dev|Prod)\(/.test(errorMiddlewareSource) ||
    !/if \(process\.env\.NODE_ENV === 'development'\) \{\s*res\.status\(err\.statusCode\)\.json\(\{[\s\S]*success:\s*false,[\s\S]*status:\s*err\.status,[\s\S]*error:\s*err,[\s\S]*message:\s*err\.message,[\s\S]*stack:\s*err\.stack[\s\S]*\}\);/.test(errorMiddlewareSource) ||
    !/if \(error\.isOperational\) \{\s*res\.status\(error\.statusCode\)\.json\(\{[\s\S]*success:\s*false,[\s\S]*status:\s*error\.status,[\s\S]*message:\s*error\.message[\s\S]*\}\);[\s\S]*\} else \{[\s\S]*res\.status\(500\)\.json\(\{[\s\S]*success:\s*false,[\s\S]*status:\s*'error',[\s\S]*message:\s*'서버에서 오류가 발생했습니다\. 잠시 후 다시 시도해주세요\.'[\s\S]*\}\);/.test(errorMiddlewareSource)
  ) {
    throw new Error('Global error middleware must inline dev/prod response bodies without single-use sendError helpers.');
  }
  if (!/로그인 실패 추적/.test(readmeSource)) {
    throw new Error('README.md must document login failure tracking only when warning logs exist.');
  }
  if (!/Admin API login failed/.test(runbookSource) || !/Web admin login failed/.test(runbookSource)) {
    throw new Error('OPERATIONS_RUNBOOK.md must list login failure warning signals.');
  }

  console.log('ok auth failure logging');
};

const verifyAdminExternalLinks = () => {
  const serverSource = fs.readFileSync(path.join(rootDir, 'src/server.js'), 'utf8');
  const sidebarSource = fs.readFileSync(path.join(rootDir, 'src/views/partials/sidebar.ejs'), 'utf8');
  const source = `${serverSource}\n${sidebarSource}`;

  if (/http:\/\/localhost:5175/.test(source)) {
    throw new Error('Admin sidebar must not hard-code the stale Vite dev port 5175.');
  }
  if (!/KIOSK_FRONTEND_URL/.test(serverSource) || !/res\.locals\.kioskFrontendUrl/.test(serverSource)) {
    throw new Error('server.js must expose kioskFrontendUrl to admin views.');
  }
  if (
    /const resolveKioskFrontendUrl\s*=|resolveKioskFrontendUrl\(/.test(serverSource) ||
    !/const configuredKioskFrontendUrl = process\.env\.KIOSK_FRONTEND_URL\?\.trim\(\);[\s\S]*const firstCorsOrigin = parseOriginList\(process\.env\.CORS_ORIGIN\)\.find\(origin => origin !== '\*'\);[\s\S]*res\.locals\.kioskFrontendUrl = configuredKioskFrontendUrl \|\| firstCorsOrigin \|\| \(isProduction \? '' : 'http:\/\/localhost:5173'\);/.test(serverSource)
  ) {
    throw new Error('server.js must inline kiosk frontend URL resolution without a single-use resolveKioskFrontendUrl helper.');
  }
  if (!/href="<%=\s*kioskFrontendUrl\s*%>"/.test(sidebarSource)) {
    throw new Error('Admin sidebar must use the configured kioskFrontendUrl.');
  }

  console.log('ok admin external links');
};

const verifyEnvSecretFileLoader = () => {
  const authMiddlewareSource = fs.readFileSync(path.join(rootDir, 'src/middleware/auth.middleware.js'), 'utf8');
  const adminControllerSource = fs.readFileSync(path.join(rootDir, 'src/controllers/admin.controller.js'), 'utf8');
  const envSecretsSource = fs.readFileSync(path.join(rootDir, 'src/utils/envSecrets.js'), 'utf8');
  const envExampleSource = fs.readFileSync(path.join(rootDir, '.env.example'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const runbookSource = fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8');
  const envSecrets = require('../src/utils/envSecrets');

  if (/dotenv['"]\)\.config\(\)/.test(authMiddlewareSource) || /dotenv['"]\)\.config\(\)/.test(adminControllerSource)) {
    throw new Error('JWT auth middleware and admin controller must rely on entrypoint env loading, not duplicate dotenv initialization.');
  }
  if (Object.keys(envSecrets).join(',') !== 'loadEnvFileSecrets' || /module\.exports = \{[\s\S]*(?:DEFAULT_SECRET_KEYS|\bloadEnvFileSecret\b)/.test(envSecretsSource)) {
    throw new Error('envSecrets utility must only export loadEnvFileSecrets; default key lists stay internal.');
  }
  if (
    /const loadEnvFileSecret\s*=|loadEnvFileSecret\(/.test(envSecretsSource) ||
    !envSecretsSource.includes("const resolvedFilePath = filePath.startsWith('/run/secrets/')") ||
    !envSecretsSource.includes("process.env.AIOSK_SECRETS_DIR || '/run/secrets'") ||
    !envSecretsSource.includes("filePath.slice('/run/secrets/'.length)") ||
    !envSecretsSource.includes("fs.readFileSync(resolvedFilePath, 'utf8').replace(/(?:\\r?\\n)+$/, '')") ||
    !/keys\.forEach\(\(key\) => \{[\s\S]*const fileKey = `\$\{key\}_FILE`;[\s\S]*const filePath = process\.env\[fileKey\];[\s\S]*if \(!filePath\) return;[\s\S]*if \(process\.env\[key\]\) \{[\s\S]*if \(loadedFileKeys\.has\(key\)\) return;[\s\S]*throw new Error\(`\$\{key\} and \$\{fileKey\} must not both be set\.`\);[\s\S]*loadedFileKeys\.add\(key\);[\s\S]*loaded\.push\(key\);/.test(envSecretsSource)
  ) {
    throw new Error('envSecrets loadEnvFileSecrets must load per-key secret files inline and resolve /run/secrets paths through AIOSK_SECRETS_DIR.');
  }
  if (
    /normalizeSecretFileValue/.test(envSecretsSource) ||
    /replace\(\/\\r\?\\n\$\/, ''\)/.test(envSecretsSource) ||
    !envSecretsSource.includes("fs.readFileSync(resolvedFilePath, 'utf8').replace(/(?:\\r?\\n)+$/, '')")
  ) {
    throw new Error('envSecrets must not keep a single-use normalizeSecretFileValue wrapper; file loading owns trailing newline trimming directly.');
  }
  ['ADMIN_PASSWORD', 'DB_PASSWORD', 'JWT_SECRET', 'KIOSK_STATUS_TOKEN', 'METRICS_TOKEN', 'SESSION_SECRET'].forEach((key) => {
    if (!envSecretsSource.includes(`'${key}'`)) {
      throw new Error(`envSecrets default secret keys must include ${key}.`);
    }
  });
  if (
    !/DB_PASSWORD_FILE=\/run\/secrets\/db_password/.test(`${envExampleSource}\n${readmeSource}\n${runbookSource}`) ||
    !/Production compose의 DB service password는 `COMPOSE_DB_PASSWORD` 계약을 사용/.test(runbookSource)
  ) {
    throw new Error('docs must document DB_PASSWORD_FILE direct backend support and the separate COMPOSE_DB_PASSWORD compose DB contract.');
  }
  if (!/METRICS_TOKEN_FILE=\/run\/secrets\/metrics_token/.test(envExampleSource)) {
    throw new Error('.env.example must document METRICS_TOKEN_FILE for file-backed metrics token loading.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-secret-loader-'));
  const secretsDir = path.join(tempDir, 'secrets');
  fs.mkdirSync(secretsDir);
  const secretFile = path.join(secretsDir, 'jwt-secret');
  const dbPasswordFile = path.join(secretsDir, 'db-password');
  fs.writeFileSync(secretFile, 'file-secret-at-least-32-characters-long\n\n');
  fs.writeFileSync(dbPasswordFile, 'db-password-from-file\n');

  try {
    const successScript = `
process.env.AIOSK_SECRETS_DIR = ${JSON.stringify(secretsDir)};
process.env.JWT_SECRET_FILE = '/run/secrets/jwt-secret';
const { loadEnvFileSecrets } = require('./src/utils/envSecrets');
const loaded = loadEnvFileSecrets(['JWT_SECRET']);
loadEnvFileSecrets(['JWT_SECRET']);
if (loaded.length !== 1 || process.env.JWT_SECRET !== 'file-secret-at-least-32-characters-long') {
  throw new Error('secret file was not loaded correctly');
}
`;
    const success = spawnSync(process.execPath, ['-e', successScript], {
      cwd: rootDir,
      encoding: 'utf8'
    });

    if (success.status !== 0) {
      throw new Error(`Env secret file loader failed:\n${success.stdout}\n${success.stderr}`);
    }

    const conflictScript = `
process.env.JWT_SECRET = 'already-set-secret-at-least-32-characters-long';
process.env.AIOSK_SECRETS_DIR = ${JSON.stringify(secretsDir)};
process.env.JWT_SECRET_FILE = '/run/secrets/jwt-secret';
const { loadEnvFileSecrets } = require('./src/utils/envSecrets');
loadEnvFileSecrets(['JWT_SECRET']);
`;
    const conflict = spawnSync(process.execPath, ['-e', conflictScript], {
      cwd: rootDir,
      encoding: 'utf8'
    });

    if (conflict.status === 0 || !`${conflict.stdout}\n${conflict.stderr}`.includes('must not both be set')) {
      throw new Error('Env secret file loader should reject simultaneous JWT_SECRET and JWT_SECRET_FILE.');
    }

    const dbPasswordScript = `
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'root';
process.env.DB_NAME = 'kiosk_db';
process.env.AIOSK_SECRETS_DIR = ${JSON.stringify(secretsDir)};
process.env.DB_PASSWORD_FILE = '/run/secrets/db-password';
const dbConfig = require('./src/config/db.config');
if (dbConfig.password !== 'db-password-from-file') {
  throw new Error('DB_PASSWORD_FILE was not loaded into db config');
}
`;
    const dbPassword = spawnSync(process.execPath, ['-e', dbPasswordScript], {
      cwd: rootDir,
      encoding: 'utf8'
    });

    if (dbPassword.status !== 0) {
      throw new Error(`DB_PASSWORD_FILE should load through db.config.js:\n${dbPassword.stdout}\n${dbPassword.stderr}`);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('ok env secret file loader');
};

const verifyDbBackupAtomicOutput = () => {
  const backupSource = fs.readFileSync(path.join(rootDir, 'scripts/db-backup.sh'), 'utf8');
  const systemdBackupServiceSource = fs.readFileSync(path.join(rootDir, 'deploy/systemd/aiosk-db-backup.service'), 'utf8');
  const systemdBackupTimerSource = fs.readFileSync(path.join(rootDir, 'deploy/systemd/aiosk-db-backup.timer'), 'utf8');
  const backupDocsSource = [
    fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8'),
    fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8'),
    fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8')
  ].join('\n');

  if (!/TEMP_OUTPUT="\$\(mktemp "\$\{OUTPUT\}\.tmp\.XXXXXX"\)"/.test(backupSource) || !/mv -f "\$TEMP_OUTPUT" "\$OUTPUT"/.test(backupSource)) {
    throw new Error('db-backup.sh must write to a temporary file and atomically move it into place only after verification.');
  }
  if (!/trap cleanup_temp_output EXIT/.test(backupSource) || !/rm -f "\$TEMP_OUTPUT"/.test(backupSource)) {
    throw new Error('db-backup.sh must clean temporary backup output when dump or verification fails.');
  }
  if (!/if \[ "\$BACKUP_VERIFY" != "0" \] && \[ "\$BACKUP_VERIFY" != "1" \]; then\s+echo "BACKUP_VERIFY must be 0 or 1\." >&2\s+exit 1\s+fi/.test(backupSource)) {
    throw new Error('db-backup.sh must reject invalid BACKUP_VERIFY values before running mysqldump.');
  }
  if (
    !/RAW_BACKUP_UPLOAD_COMMAND="\$\{BACKUP_UPLOAD_COMMAND:-\}"/.test(backupSource) ||
    !/BACKUP_UPLOAD_COMMAND="\$\(trim "\$RAW_BACKUP_UPLOAD_COMMAND"\)"/.test(backupSource) ||
    !/BACKUP_UPLOAD_COMMAND must not be blank\./.test(backupSource)
  ) {
    throw new Error('db-backup.sh must reject blank BACKUP_UPLOAD_COMMAND values before running mysqldump.');
  }
  if (!/BACKUP_UPLOAD_COMMAND[^.\n]*blank/.test(backupDocsSource)) {
    throw new Error('docs must record that blank BACKUP_UPLOAD_COMMAND values fail before mysqldump.');
  }
  if (
    !/Documentation=file:\/opt\/aiosk\/README\.md file:\/opt\/aiosk\/OPERATIONS_RUNBOOK\.md/.test(systemdBackupServiceSource) ||
    /^Documentation=(?!file:|https?:|man:|info:)/m.test(systemdBackupServiceSource) ||
    !/EnvironmentFile=\/opt\/aiosk\/\.env\.production/.test(systemdBackupServiceSource) ||
    !/Environment=BACKUP_ENV_FILE=\/opt\/aiosk\/\.env\.production/.test(systemdBackupServiceSource) ||
    /EnvironmentFile=\/opt\/aiosk\/\.env(?:\n|$)/.test(systemdBackupServiceSource) ||
    /BACKUP_UPLOAD_COMMAND in \/opt\/aiosk\/\.env(?:\s|$)/.test(systemdBackupServiceSource)
  ) {
    throw new Error('systemd backup service must use valid file: documentation URLs and /opt/aiosk/.env.production explicitly instead of stale relative docs or /opt/aiosk/.env fallback.');
  }
  if (
    !/Type=oneshot/.test(systemdBackupServiceSource) ||
    !/ExecStart=\/usr\/bin\/env bash \/opt\/aiosk\/scripts\/db-backup\.sh/.test(systemdBackupServiceSource) ||
    !/OnCalendar=\*-\*-\* 03:15:00/.test(systemdBackupTimerSource) ||
    !/Persistent=true/.test(systemdBackupTimerSource) ||
    !/Unit=aiosk-db-backup\.service/.test(systemdBackupTimerSource) ||
    !/WantedBy=timers\.target/.test(systemdBackupTimerSource)
  ) {
    throw new Error('systemd backup timer must run the oneshot backup service daily, catch missed runs, and install under timers.target.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-db-backup-atomic-'));
  const binDir = path.join(tempDir, 'bin');
  const backupDir = path.join(tempDir, 'backups');
  fs.mkdirSync(binDir);
  fs.mkdirSync(backupDir);

  const mysqldumpPath = path.join(binDir, 'mysqldump');
  const runBackup = (outputPath, extraEnv = {}) => spawnSync('bash', ['scripts/db-backup.sh', outputPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      BACKUP_ENV_FILE: '/dev/null',
      DB_NAME: 'kiosk_db',
      DB_PASSWORD: 'static-verify-password',
      BACKUP_VERIFY: '1',
      ...extraEnv
    },
    encoding: 'utf8'
  });

  try {
    const invalidVerifyInvoked = path.join(tempDir, 'invalid-backup-verify-mysqldump-invoked');
    fs.writeFileSync(mysqldumpPath, [
      '#!/usr/bin/env bash',
      'printf invoked > "$MYSQLDUMP_INVOKED_FILE"',
      'printf "dump should not run\\n"',
      ''
    ].join('\n'));
    fs.chmodSync(mysqldumpPath, 0o755);

    const invalidVerifyOutput = path.join(backupDir, 'kiosk_db_invalid_verify.sql.gz');
    const invalidVerify = runBackup(invalidVerifyOutput, {
      BACKUP_VERIFY: 'true',
      MYSQLDUMP_INVOKED_FILE: invalidVerifyInvoked
    });
    if (invalidVerify.status === 0 || !`${invalidVerify.stdout}\n${invalidVerify.stderr}`.includes('BACKUP_VERIFY must be 0 or 1.')) {
      throw new Error('db-backup.sh should reject invalid BACKUP_VERIFY values.');
    }
    if (fs.existsSync(invalidVerifyInvoked) || fs.existsSync(invalidVerifyOutput)) {
      throw new Error('db-backup.sh must not invoke mysqldump or create a backup artifact for invalid BACKUP_VERIFY values.');
    }

    const blankUploadCommandInvoked = path.join(tempDir, 'blank-upload-command-mysqldump-invoked');
    const blankUploadCommandOutput = path.join(backupDir, 'kiosk_db_blank_upload.sql.gz');
    const blankUploadCommand = runBackup(blankUploadCommandOutput, {
      BACKUP_UPLOAD_COMMAND: '   ',
      MYSQLDUMP_INVOKED_FILE: blankUploadCommandInvoked
    });
    if (blankUploadCommand.status === 0 || !`${blankUploadCommand.stdout}\n${blankUploadCommand.stderr}`.includes('BACKUP_UPLOAD_COMMAND must not be blank.')) {
      throw new Error(`db-backup.sh should reject blank BACKUP_UPLOAD_COMMAND values:\n${blankUploadCommand.stdout}\n${blankUploadCommand.stderr}`);
    }
    if (fs.existsSync(blankUploadCommandInvoked) || fs.existsSync(blankUploadCommandOutput)) {
      throw new Error('db-backup.sh must reject blank BACKUP_UPLOAD_COMMAND values before mysqldump or backup artifact creation.');
    }

    fs.writeFileSync(mysqldumpPath, [
      '#!/usr/bin/env bash',
      'printf "partial dump before failure\\n"',
      'exit 23',
      ''
    ].join('\n'));
    fs.chmodSync(mysqldumpPath, 0o755);

    const failedOutput = path.join(backupDir, 'kiosk_db_failed.sql.gz');
    const failed = runBackup(failedOutput);
    if (failed.status === 0 || fs.existsSync(failedOutput)) {
      throw new Error('db-backup.sh must not leave the requested backup artifact when mysqldump fails.');
    }
    const failedTemps = fs.readdirSync(backupDir).filter((name) => name.includes('.tmp.'));
    if (failedTemps.length > 0) {
      throw new Error(`db-backup.sh left temporary backup output after failure: ${failedTemps.join(', ')}`);
    }

    fs.writeFileSync(mysqldumpPath, [
      '#!/usr/bin/env bash',
      'printf "complete dump\\n"',
      ''
    ].join('\n'));
    fs.chmodSync(mysqldumpPath, 0o755);

    const successOutput = path.join(backupDir, 'kiosk_db_success.sql.gz');
    const success = runBackup(successOutput);
    if (success.status !== 0) {
      throw new Error(`db-backup.sh should create a backup with a successful dump:\n${success.stdout}\n${success.stderr}`);
    }
    if (!fs.existsSync(successOutput)) {
      throw new Error('db-backup.sh did not create the final backup artifact after a successful dump.');
    }
    const contents = zlib.gunzipSync(fs.readFileSync(successOutput), 'utf8').toString('utf8');
    if (contents !== 'complete dump\n') {
      throw new Error('db-backup.sh final backup contents did not match the completed dump.');
    }

    const uploadOutput = path.join(backupDir, 'kiosk_db_upload.sql.gz');
    const uploadLog = path.join(tempDir, 'upload.log');
    const uploadSuccess = runBackup(uploadOutput, {
      BACKUP_UPLOAD_LOG: uploadLog,
      BACKUP_UPLOAD_COMMAND: ' printf "%s\\n%s\\n%s\\n" "$BACKUP_FILE" "$BACKUP_BASENAME" "$BACKUP_DB_NAME" > "$BACKUP_UPLOAD_LOG" '
    });
    if (uploadSuccess.status !== 0) {
      throw new Error(`db-backup.sh should run successful BACKUP_UPLOAD_COMMAND hooks:\n${uploadSuccess.stdout}\n${uploadSuccess.stderr}`);
    }
    const uploadLogLines = fs.readFileSync(uploadLog, 'utf8').trimEnd().split('\n');
    if (
      uploadLogLines[0] !== uploadOutput ||
      uploadLogLines[1] !== path.basename(uploadOutput) ||
      uploadLogLines[2] !== 'kiosk_db'
    ) {
      throw new Error(`db-backup.sh did not pass backup hook env vars correctly:\n${uploadLogLines.join('\n')}`);
    }

    const uploadFailureOutput = path.join(backupDir, 'kiosk_db_upload_failure.sql.gz');
    const uploadFailure = runBackup(uploadFailureOutput, {
      BACKUP_UPLOAD_COMMAND: 'exit 42'
    });
    if (uploadFailure.status === 0) {
      throw new Error('db-backup.sh must fail when BACKUP_UPLOAD_COMMAND fails.');
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('ok db backup atomic output');
};

const verifyDbRestoreGzipPreflight = () => {
  const restoreSource = fs.readFileSync(path.join(rootDir, 'scripts/db-restore.sh'), 'utf8');

  if (!/gzip -t "\$BACKUP_FILE"\s+RESTORE_CMD=\(gzip -dc "\$BACKUP_FILE"\)/.test(restoreSource)) {
    throw new Error('db-restore.sh must validate gzip backups before starting mysql restore.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-db-restore-gzip-'));
  const binDir = path.join(tempDir, 'bin');
  fs.mkdirSync(binDir);

  const mysqlPath = path.join(binDir, 'mysql');
  fs.writeFileSync(mysqlPath, [
    '#!/usr/bin/env bash',
    'cat >/dev/null',
    'printf invoked > "$MYSQL_INVOKED_FILE"',
    ''
  ].join('\n'));
  fs.chmodSync(mysqlPath, 0o755);

  const runRestore = (backupPath, invokedPath) => spawnSync('bash', ['scripts/db-restore.sh', backupPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      RESTORE_ENV_FILE: '/dev/null',
      DB_HOST: '',
      DB_PORT: '',
      DB_USER: '',
      DB_NAME: '',
      DB_PASSWORD: '',
      COMPOSE_DB_HOST: '',
      COMPOSE_DB_BIND: '127.0.0.1',
      COMPOSE_DB_PORT: '3306',
      COMPOSE_DB_USER: 'root',
      COMPOSE_DB_PASSWORD: 'static-verify-password',
      COMPOSE_DB_NAME: 'aiosk_restore_static',
      MYSQL_INVOKED_FILE: invokedPath
    },
    encoding: 'utf8'
  });

  try {
    const corruptBackup = path.join(tempDir, 'corrupt.sql.gz');
    const corruptInvoked = path.join(tempDir, 'corrupt-invoked');
    fs.writeFileSync(corruptBackup, 'not a gzip archive');

    const corrupt = runRestore(corruptBackup, corruptInvoked);
    if (corrupt.status === 0 || fs.existsSync(corruptInvoked)) {
      throw new Error('db-restore.sh must not invoke mysql when gzip validation fails.');
    }

    const validBackup = path.join(tempDir, 'valid.sql.gz');
    const validInvoked = path.join(tempDir, 'valid-invoked');
    fs.writeFileSync(validBackup, zlib.gzipSync('SELECT 1;\n'));

    const valid = runRestore(validBackup, validInvoked);
    if (valid.status !== 0 || !fs.existsSync(validInvoked)) {
      throw new Error(`db-restore.sh should invoke mysql for valid gzip backups:\n${valid.stdout}\n${valid.stderr}`);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('ok db restore gzip preflight');
};

const verifyDbRestoreSafetyFlagContract = () => {
  const restoreSource = fs.readFileSync(path.join(rootDir, 'scripts/db-restore.sh'), 'utf8');
  const drillSource = fs.readFileSync(path.join(rootDir, 'scripts/db-restore-drill.sh'), 'utf8');

  if (!/ALLOW_PRODUCTION_RESTORE="\$\{ALLOW_PRODUCTION_RESTORE:-0\}"/.test(restoreSource) || !/ALLOW_PRODUCTION_RESTORE must be 0 or 1/.test(restoreSource)) {
    throw new Error('db-restore.sh must validate ALLOW_PRODUCTION_RESTORE as 0 or 1 before restore work.');
  }
  if (!/ALLOW_UNSAFE_RESTORE_DRILL="\$\{ALLOW_UNSAFE_RESTORE_DRILL:-0\}"/.test(drillSource) || !/ALLOW_UNSAFE_RESTORE_DRILL must be 0 or 1/.test(drillSource)) {
    throw new Error('db-restore-drill.sh must validate ALLOW_UNSAFE_RESTORE_DRILL as 0 or 1 before drill work.');
  }
  const restoreMysqlCheckIndex = restoreSource.indexOf('command -v mysql');
  const restoreSafetyFlagIndex = restoreSource.indexOf('ALLOW_PRODUCTION_RESTORE must be 0 or 1.');
  const drillMysqlCheckIndex = drillSource.indexOf('command -v mysql');
  const drillKeepFlagIndex = drillSource.indexOf('DRILL_KEEP_DB must be 0 or 1.');
  const drillSafetyFlagIndex = drillSource.indexOf('ALLOW_UNSAFE_RESTORE_DRILL must be 0 or 1.');
  if (
    restoreMysqlCheckIndex === -1 ||
    restoreSafetyFlagIndex === -1 ||
    restoreSafetyFlagIndex > restoreMysqlCheckIndex ||
    drillMysqlCheckIndex === -1 ||
    drillKeepFlagIndex === -1 ||
    drillSafetyFlagIndex === -1 ||
    drillKeepFlagIndex > drillMysqlCheckIndex ||
    drillSafetyFlagIndex > drillMysqlCheckIndex
  ) {
    throw new Error('DB restore scripts must validate safety flags before checking mysql client availability.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-db-restore-safety-flags-'));
  const binDir = path.join(tempDir, 'bin');
  fs.mkdirSync(binDir);

  const mysqlPath = path.join(binDir, 'mysql');
  fs.writeFileSync(mysqlPath, [
    '#!/usr/bin/env bash',
    'printf invoked > "$MYSQL_INVOKED_FILE"',
    'cat >/dev/null',
    ''
  ].join('\n'));
  fs.chmodSync(mysqlPath, 0o755);

  try {
    const restoreInvoked = path.join(tempDir, 'restore-invoked');
    const backupPath = path.join(tempDir, 'valid.sql.gz');
    fs.writeFileSync(backupPath, zlib.gzipSync('SELECT 1;\n'));

    const invalidRestore = spawnSync('bash', ['scripts/db-restore.sh', backupPath], {
      cwd: rootDir,
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
        RESTORE_ENV_FILE: '/dev/null',
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        DB_USER: 'root',
        DB_PASSWORD: 'static-verify-password',
        DB_NAME: 'kiosk_db',
        ALLOW_PRODUCTION_RESTORE: 'true',
        MYSQL_INVOKED_FILE: restoreInvoked
      },
      encoding: 'utf8'
    });
    if (invalidRestore.status === 0 || !`${invalidRestore.stdout}\n${invalidRestore.stderr}`.includes('ALLOW_PRODUCTION_RESTORE must be 0 or 1.')) {
      throw new Error(`db-restore.sh should reject invalid ALLOW_PRODUCTION_RESTORE:\n${invalidRestore.stdout}\n${invalidRestore.stderr}`);
    }
    if (fs.existsSync(restoreInvoked)) {
      throw new Error('db-restore.sh must reject invalid ALLOW_PRODUCTION_RESTORE before invoking mysql.');
    }

    const drillInvoked = path.join(tempDir, 'drill-invoked');
    const invalidDrill = spawnSync('bash', ['scripts/db-restore-drill.sh'], {
      cwd: rootDir,
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
        DRILL_ENV_FILE: '/dev/null',
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        DB_USER: 'root',
        DB_PASSWORD: 'static-verify-password',
        DB_NAME: 'kiosk_db',
        ALLOW_UNSAFE_RESTORE_DRILL: 'true',
        MYSQL_INVOKED_FILE: drillInvoked
      },
      encoding: 'utf8'
    });
    if (invalidDrill.status === 0 || !`${invalidDrill.stdout}\n${invalidDrill.stderr}`.includes('ALLOW_UNSAFE_RESTORE_DRILL must be 0 or 1.')) {
      throw new Error(`db-restore-drill.sh should reject invalid ALLOW_UNSAFE_RESTORE_DRILL:\n${invalidDrill.stdout}\n${invalidDrill.stderr}`);
    }
    if (fs.existsSync(drillInvoked)) {
      throw new Error('db-restore-drill.sh must reject invalid ALLOW_UNSAFE_RESTORE_DRILL before invoking mysql.');
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('ok db restore safety flag contract');
};

const verifyDbShellComposeEnvContracts = () => {
  const scriptContracts = [
    { file: 'scripts/db-backup.sh', envFileName: 'BACKUP_ENV_FILE' },
    { file: 'scripts/db-restore.sh', envFileName: 'RESTORE_ENV_FILE' },
    { file: 'scripts/db-restore-drill.sh', envFileName: 'DRILL_ENV_FILE' },
    { file: 'scripts/db-apply-schema.sh', envFileName: 'SCHEMA_ENV_FILE' }
  ];

  scriptContracts.forEach(({ file, envFileName }) => {
    const source = fs.readFileSync(path.join(rootDir, file), 'utf8');
    const expectedEnvFileAssignment = 'ENV_FILE="${' + envFileName + ':-$ROOT_DIR/.env}"';

    if (!source.includes(expectedEnvFileAssignment)) {
      throw new Error(`${file} must support ${envFileName} for production env files.`);
    }
    if (!source.includes('COMPOSE_DB_BIND') || !source.includes('COMPOSE_DB_HOST')) {
      throw new Error(`${file} must map COMPOSE_DB_BIND to DB_HOST for host-side mysql clients.`);
    }
    if (
      /set -a/.test(source) ||
      /\. "\$ENV_FILE"/.test(source) ||
      !/load_env_file\(\) \{[\s\S]*line_number=0[\s\S]*line_number=\$\(\(line_number \+ 1\)\)[\s\S]*\[\[ "\$line" =~ \^\[A-Za-z_\]\[A-Za-z0-9_\]\*= \]\][\s\S]*export "\$key=\$\(unquote "\$value"\)"[\s\S]*malformed env line \$line_number in \$ENV_FILE/.test(source)
    ) {
      throw new Error(`${file} must parse env files as literal key/value data instead of sourcing shell code.`);
    }
    if (!source.includes('COMPOSE_DB_PORT') || !source.includes('COMPOSE_DB_USER') || !source.includes('COMPOSE_DB_PASSWORD') || !source.includes('COMPOSE_DB_NAME')) {
      throw new Error(`${file} must use COMPOSE_DB_* values as database env fallbacks.`);
    }
    if (
      !/resolve_secret_file_path\(\)/.test(source) ||
      !/file_path#\/run\/secrets\//.test(source) ||
      !/AIOSK_SECRETS_DIR/.test(source) ||
      !/load_db_password_file\(\)/.test(source) ||
      !/DB_PASSWORD and DB_PASSWORD_FILE must not both be set/.test(source) ||
      !/DB_PASSWORD_FILE points to a missing file on the host/.test(source) ||
      !/DB_USER="\$\{DB_USER:-\$\{COMPOSE_DB_USER:-root\}\}"\s+load_db_password_file\s+DB_PASSWORD="\$\{DB_PASSWORD:-\$\{COMPOSE_DB_PASSWORD:-\}\}"/.test(source)
    ) {
      throw new Error(`${file} must support DB_PASSWORD_FILE with /run/secrets host mapping before falling back to COMPOSE_DB_PASSWORD.`);
    }
    if (!/COMPOSE_DB_BIND"\s*=\s*"0\.0\.0\.0"/.test(source) || !/COMPOSE_DB_HOST="127\.0\.0\.1"/.test(source)) {
      throw new Error(`${file} must avoid using 0.0.0.0 as a mysql client destination.`);
    }
    if (!/if ! \[\[ "\$DB_PORT" =~ \^\[1-9\]\[0-9\]\*\$ \]\] \|\| \[ "\$\{#DB_PORT\}" -gt 5 \] \|\| \[ "\$DB_PORT" -gt 65535 \]; then\s+echo "DB_PORT\/COMPOSE_DB_PORT must be a positive integer between 1 and 65535\." >&2\s+exit 1\s+fi/.test(source)) {
      throw new Error(`${file} must strictly validate DB_PORT/COMPOSE_DB_PORT before invoking mysql clients.`);
    }
    const dbNameValidationIndex = source.indexOf('validate_database_identifier "$DB_NAME"');
    const mysqlClientCheckIndex = source.indexOf('command -v mysql');
    if (file !== 'scripts/db-restore-drill.sh' && (
      !/validate_database_identifier\(\) \{[\s\S]*\[\[ "\$name" =~ \^\[A-Za-z0-9_\]\+\$ \]\][\s\S]*DB_NAME\/COMPOSE_DB_NAME must contain only letters, numbers, and underscores/.test(source) ||
      dbNameValidationIndex === -1 ||
      (mysqlClientCheckIndex !== -1 && dbNameValidationIndex > mysqlClientCheckIndex)
    )) {
      throw new Error(`${file} must validate DB_NAME/COMPOSE_DB_NAME as a safe identifier before invoking mysql clients.`);
    }
    if (
      !/reject_option_like_path\(\) \{[\s\S]*\[\[ "\$value" == -\* \]\][\s\S]*must not start with '-'\./.test(source)
    ) {
      throw new Error(`${file} must reject option-like positional paths before shell utilities can interpret them as flags.`);
    }
  });
  const drillSource = fs.readFileSync(path.join(rootDir, 'scripts/db-restore-drill.sh'), 'utf8');
  const drillBackupPathValidationIndex = drillSource.indexOf('reject_option_like_path "backup file path" "$BACKUP_FILE"');
  if (
    drillSource.indexOf('escape_identifier "$SOURCE_DB_NAME" >/dev/null') > drillSource.indexOf('command -v mysql') ||
    !/Provide a backup file or set DRILL_SOURCE_DB_NAME\/DB_NAME for generated backup drill/.test(drillSource) ||
    drillBackupPathValidationIndex === -1 ||
    drillBackupPathValidationIndex > drillSource.indexOf('command -v mysql')
  ) {
    throw new Error('db-restore-drill.sh must validate generated-backup source DB names and option-like backup paths before checking mysql clients.');
  }

  const argGuardContracts = [
    { file: 'scripts/db-backup.sh', pattern: /if \[ "\$#" -gt 1 \]; then\s+echo "Usage: \$0 \[backup\.sql\.gz\]" >&2\s+exit 1\s+fi/ },
    { file: 'scripts/db-restore.sh', pattern: /if \[ "\$#" -ne 1 \]; then\s+echo "Usage: \$0 <backup\.sql\|backup\.sql\.gz>" >&2\s+exit 1\s+fi/ },
    { file: 'scripts/db-restore-drill.sh', pattern: /if \[ "\$#" -gt 1 \]; then\s+usage\s+exit 1\s+fi/ },
    { file: 'scripts/db-apply-schema.sh', pattern: /if \[ "\$#" -gt 1 \]; then\s+echo "Usage: \$0 \[schema\.sql\]" >&2\s+exit 1\s+fi/ }
  ];
  argGuardContracts.forEach(({ file, pattern }) => {
    const source = fs.readFileSync(path.join(rootDir, file), 'utf8');
    if (!pattern.test(source)) {
      throw new Error(`${file} must reject unexpected positional arguments before DB shell work.`);
    }
  });

  const invalidPortCases = [
    ['partial DB_PORT', { DB_PORT: '3306abc', COMPOSE_DB_PORT: '' }],
    ['out-of-range COMPOSE_DB_PORT', { DB_PORT: '', COMPOSE_DB_PORT: '65536' }]
  ];
  const scriptPortSmoke = [
    { file: 'scripts/db-backup.sh', envFileName: 'BACKUP_ENV_FILE', args: [path.join(os.tmpdir(), 'aiosk-invalid-port-backup.sql.gz')] },
    { file: 'scripts/db-restore.sh', envFileName: 'RESTORE_ENV_FILE', args: [path.join(os.tmpdir(), 'aiosk-invalid-port-restore.sql.gz')] },
    { file: 'scripts/db-restore-drill.sh', envFileName: 'DRILL_ENV_FILE', args: [] },
    { file: 'scripts/db-apply-schema.sh', envFileName: 'SCHEMA_ENV_FILE', args: [path.join(os.tmpdir(), 'aiosk-invalid-port-schema.sql')] }
  ];

  scriptPortSmoke.forEach(({ file, envFileName, args }) => {
    invalidPortCases.forEach(([label, portEnv]) => {
      const result = spawnSync('bash', [file, ...args], {
        cwd: rootDir,
        env: {
          ...process.env,
          [envFileName]: '/dev/null',
          DB_HOST: '127.0.0.1',
          DB_USER: 'root',
          DB_PASSWORD: 'static-verify-password',
          DB_NAME: 'aiosk_e2e_shell_port',
          COMPOSE_DB_HOST: '',
          COMPOSE_DB_BIND: '',
          COMPOSE_DB_USER: '',
          COMPOSE_DB_PASSWORD: '',
          COMPOSE_DB_NAME: '',
          ...portEnv
        },
        encoding: 'utf8'
      });

      if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes('DB_PORT/COMPOSE_DB_PORT must be a positive integer between 1 and 65535.')) {
        throw new Error(`${file} should reject ${label} before invoking mysql clients:\n${result.stdout}\n${result.stderr}`);
      }
    });
  });

  [
    { file: 'scripts/db-backup.sh', envFileName: 'BACKUP_ENV_FILE', args: [path.join(os.tmpdir(), 'aiosk-invalid-db-name-backup.sql.gz')] },
    { file: 'scripts/db-restore.sh', envFileName: 'RESTORE_ENV_FILE', args: [path.join(os.tmpdir(), 'aiosk-invalid-db-name-restore.sql.gz')] },
    { file: 'scripts/db-apply-schema.sh', envFileName: 'SCHEMA_ENV_FILE', args: [path.join(os.tmpdir(), 'aiosk-invalid-db-name-schema.sql')] }
  ].forEach(({ file, envFileName, args }) => {
    const result = spawnSync('bash', [file, ...args], {
      cwd: rootDir,
      env: {
        ...process.env,
        [envFileName]: '/dev/null',
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        DB_USER: 'root',
        DB_PASSWORD: 'static-verify-password',
        DB_NAME: 'bad-name',
        COMPOSE_DB_HOST: '',
        COMPOSE_DB_BIND: '',
        COMPOSE_DB_PORT: '',
        COMPOSE_DB_USER: '',
        COMPOSE_DB_PASSWORD: '',
        COMPOSE_DB_NAME: ''
      },
      encoding: 'utf8'
    });
    const output = `${result.stdout}\n${result.stderr}`;
    if (
      result.status === 0 ||
      !output.includes('DB_NAME/COMPOSE_DB_NAME must contain only letters, numbers, and underscores.') ||
      /mysqldump is required|mysql client is required|Schema file not found|Backup file not found/.test(output)
    ) {
      throw new Error(`${file} should reject unsafe DB_NAME values before mysql client work:\n${output}`);
    }
  });

  const invalidDrillSourceDb = spawnSync('bash', ['scripts/db-restore-drill.sh'], {
    cwd: rootDir,
    env: {
      ...process.env,
      DRILL_ENV_FILE: '/dev/null',
      DB_HOST: '127.0.0.1',
      DB_PORT: '3306',
      DB_USER: 'root',
      DB_PASSWORD: 'static-verify-password',
      DRILL_SOURCE_DB_NAME: 'bad-name',
      DRILL_DB_NAME: 'aiosk_restore_verify',
      COMPOSE_DB_HOST: '',
      COMPOSE_DB_BIND: '',
      COMPOSE_DB_PORT: '',
      COMPOSE_DB_USER: '',
      COMPOSE_DB_PASSWORD: '',
      COMPOSE_DB_NAME: ''
    },
    encoding: 'utf8'
  });
  const invalidDrillSourceDbOutput = `${invalidDrillSourceDb.stdout}\n${invalidDrillSourceDb.stderr}`;
  if (
    invalidDrillSourceDb.status === 0 ||
    !invalidDrillSourceDbOutput.includes('Unsafe database identifier: bad-name') ||
    /mysql client is required/.test(invalidDrillSourceDbOutput)
  ) {
    throw new Error(`db-restore-drill.sh should reject unsafe source DB names before mysql client checks:\n${invalidDrillSourceDbOutput}`);
  }

  [
    {
      file: 'scripts/db-backup.sh',
      envFileName: 'BACKUP_ENV_FILE',
      args: ['-backup.sql.gz'],
      expectedMessage: "backup output path must not start with '-'.",
      unexpectedMessage: 'mysqldump is required'
    },
    {
      file: 'scripts/db-restore.sh',
      envFileName: 'RESTORE_ENV_FILE',
      args: ['-backup.sql.gz'],
      expectedMessage: "backup file path must not start with '-'.",
      unexpectedMessage: 'Backup file not found'
    },
    {
      file: 'scripts/db-restore-drill.sh',
      envFileName: 'DRILL_ENV_FILE',
      args: ['-backup.sql.gz'],
      expectedMessage: "backup file path must not start with '-'.",
      unexpectedMessage: 'mysql client is required'
    },
    {
      file: 'scripts/db-apply-schema.sh',
      envFileName: 'SCHEMA_ENV_FILE',
      args: ['-schema.sql'],
      expectedMessage: "schema file path must not start with '-'.",
      unexpectedMessage: 'Schema file not found'
    }
  ].forEach(({ file, envFileName, args, expectedMessage, unexpectedMessage }) => {
    const result = spawnSync('bash', [file, ...args], {
      cwd: rootDir,
      env: {
        ...process.env,
        [envFileName]: '/dev/null',
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        DB_USER: 'root',
        DB_PASSWORD: 'static-verify-password',
        DB_NAME: 'aiosk_restore_path_guard',
        DRILL_DB_NAME: 'aiosk_restore_path_guard',
        COMPOSE_DB_HOST: '',
        COMPOSE_DB_BIND: '',
        COMPOSE_DB_PORT: '',
        COMPOSE_DB_USER: '',
        COMPOSE_DB_PASSWORD: '',
        COMPOSE_DB_NAME: ''
      },
      encoding: 'utf8'
    });
    const output = `${result.stdout}\n${result.stderr}`;
    if (
      result.status === 0 ||
      !output.includes(expectedMessage) ||
      output.includes(unexpectedMessage)
    ) {
      throw new Error(`${file} should reject option-like positional paths before shell utility work:\n${output}`);
    }
  });

  const tempEnvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-db-shell-env-parser-'));
  try {
    scriptPortSmoke.forEach(({ file, envFileName, args }) => {
      const envPath = path.join(tempEnvDir, `${path.basename(file)}.env`);
      const markerPath = path.join(tempEnvDir, `${path.basename(file)}.marker`);
      fs.writeFileSync(envPath, [
        'DB_HOST=127.0.0.1',
        'DB_USER=root',
        'DB_PASSWORD=static-verify-password',
        'DB_NAME=aiosk_e2e_shell_env_parser',
        `DB_PORT=$(touch ${markerPath})`,
        ''
      ].join('\n'));

      const commandSubstitutionResult = spawnSync('bash', [file, ...args], {
        cwd: rootDir,
        env: {
          ...process.env,
          [envFileName]: envPath,
          DB_HOST: '',
          DB_PORT: '',
          DB_USER: '',
          DB_PASSWORD: '',
          DB_NAME: '',
          COMPOSE_DB_HOST: '',
          COMPOSE_DB_BIND: '',
          COMPOSE_DB_PORT: '',
          COMPOSE_DB_USER: '',
          COMPOSE_DB_PASSWORD: '',
          COMPOSE_DB_NAME: ''
        },
        encoding: 'utf8',
        timeout: 10000
      });
      const commandSubstitutionOutput = `${commandSubstitutionResult.stdout}\n${commandSubstitutionResult.stderr}`;
      if (
        commandSubstitutionResult.status === 0 ||
        !commandSubstitutionOutput.includes('DB_PORT/COMPOSE_DB_PORT must be a positive integer between 1 and 65535.') ||
        fs.existsSync(markerPath)
      ) {
        throw new Error(`${file} must not execute command substitution while loading env files:\n${commandSubstitutionOutput}`);
      }

      fs.writeFileSync(envPath, [
        'DB_NAME=aiosk_e2e_shell_env_parser',
        'NOT A VALID ENV LINE',
        ''
      ].join('\n'));
      const malformedResult = spawnSync('bash', [file, ...args], {
        cwd: rootDir,
        env: {
          ...process.env,
          [envFileName]: envPath,
          DB_HOST: '',
          DB_PORT: '',
          DB_USER: '',
          DB_PASSWORD: '',
          DB_NAME: '',
          COMPOSE_DB_HOST: '',
          COMPOSE_DB_BIND: '',
          COMPOSE_DB_PORT: '',
          COMPOSE_DB_USER: '',
          COMPOSE_DB_PASSWORD: '',
          COMPOSE_DB_NAME: ''
        },
        encoding: 'utf8',
        timeout: 10000
      });
      const malformedOutput = `${malformedResult.stdout}\n${malformedResult.stderr}`;
      if (
        malformedResult.status === 0 ||
        !malformedOutput.includes(`malformed env line 2 in ${envPath}`) ||
        /NOT A VALID ENV LINE|mysqldump is required|mysql client is required|Schema file not found|Backup file not found/.test(malformedOutput)
      ) {
        throw new Error(`${file} should reject malformed env lines before DB shell work without echoing env content:\n${malformedOutput}`);
      }
    });
  } finally {
    fs.rmSync(tempEnvDir, { recursive: true, force: true });
  }

  const runbookSource = fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const auditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');
  const docsSource = `${runbookSource}\n${readmeSource}`;
  if (!/BACKUP_ENV_FILE=\.env\.production npm run db:backup/.test(docsSource)) {
    throw new Error('runbook or README must document production backup with BACKUP_ENV_FILE=.env.production.');
  }
  if (!/SCHEMA_ENV_FILE=\.env\.production CONFIRM_SCHEMA_APPLY=kiosk_db npm run db:apply-schema/.test(docsSource)) {
    throw new Error('runbook or README must document production schema apply with SCHEMA_ENV_FILE=.env.production.');
  }
  if (!/RESTORE_ENV_FILE=\.env\.production ALLOW_PRODUCTION_RESTORE=1 npm run db:restore/.test(docsSource)) {
    throw new Error('runbook or README must document production restore with RESTORE_ENV_FILE=.env.production.');
  }
  if (!/DRILL_ENV_FILE=\.env\.production npm run db:restore:drill/.test(docsSource)) {
    throw new Error('runbook or README must document production restore drill with DRILL_ENV_FILE=.env.production.');
  }
  if (!/DB shell operation positional arguments fail before mysql clients/.test(`${docsSource}\n${auditSource}`)) {
    throw new Error('docs must record that unexpected DB shell operation positional arguments fail before mysql clients.');
  }
  if (!/Shell DB password도 `DB_PASSWORD_FILE`을 지원/.test(`${docsSource}\n${auditSource}`)) {
    throw new Error('docs must record DB_PASSWORD_FILE support for DB shell operations.');
  }
  if (!/DB shell env files are parsed as literal key\/value data/.test(`${docsSource}\n${auditSource}`)) {
    throw new Error('docs must record that DB shell env files are parsed as literal key/value data.');
  }
  if (!/DB_NAME`\/`COMPOSE_DB_NAME`[^.\n]*letters\/numbers\/underscores only identifier/.test(`${docsSource}\n${auditSource}`)) {
    throw new Error('docs must record DB_NAME/COMPOSE_DB_NAME safe identifier validation before DB shell client work.');
  }
  if (!/Option-like backup\/schema paths fail before DB shell work/.test(`${docsSource}\n${auditSource}`)) {
    throw new Error('docs must record that option-like backup/schema paths fail before DB shell work.');
  }

  [
    {
      file: 'scripts/db-backup.sh',
      args: [path.join(os.tmpdir(), 'aiosk-extra-arg-backup.sql.gz'), 'extra'],
      envFileName: 'BACKUP_ENV_FILE',
      unexpectedMessage: 'mysqldump is required'
    },
    {
      file: 'scripts/db-restore.sh',
      args: [path.join(os.tmpdir(), 'aiosk-extra-arg-restore.sql.gz'), 'extra'],
      envFileName: 'RESTORE_ENV_FILE',
      unexpectedMessage: 'Backup file not found'
    },
    {
      file: 'scripts/db-restore-drill.sh',
      args: [path.join(os.tmpdir(), 'aiosk-extra-arg-drill.sql.gz'), 'extra'],
      envFileName: 'DRILL_ENV_FILE',
      unexpectedMessage: 'mysql client is required'
    },
    {
      file: 'scripts/db-apply-schema.sh',
      args: [path.join(os.tmpdir(), 'aiosk-extra-arg-schema.sql'), 'extra'],
      envFileName: 'SCHEMA_ENV_FILE',
      unexpectedMessage: 'Schema file not found'
    }
  ].forEach(({ file, args, envFileName, unexpectedMessage }) => {
    const result = spawnSync('bash', [file, ...args], {
      cwd: rootDir,
      env: {
        ...process.env,
        [envFileName]: '/dev/null',
        DB_HOST: '',
        DB_PORT: '',
        DB_USER: '',
        DB_PASSWORD: '',
        DB_NAME: '',
        COMPOSE_DB_HOST: '',
        COMPOSE_DB_BIND: '',
        COMPOSE_DB_PORT: '',
        COMPOSE_DB_USER: '',
        COMPOSE_DB_PASSWORD: '',
        COMPOSE_DB_NAME: ''
      },
      encoding: 'utf8',
      timeout: 10000
    });

    if (
      result.status === 0 ||
      !`${result.stdout}\n${result.stderr}`.includes('Usage:') ||
      `${result.stdout}\n${result.stderr}`.includes(unexpectedMessage)
    ) {
      throw new Error(`${file} should reject unexpected positional arguments before DB shell work:\n${result.stdout}\n${result.stderr}`);
    }
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-db-schema-env-'));
  const binDir = path.join(tempDir, 'bin');
  fs.mkdirSync(binDir);

  const mysqlPath = path.join(binDir, 'mysql');
  fs.writeFileSync(mysqlPath, [
    '#!/usr/bin/env bash',
    'printf "%s\\n" "$*" > "$MYSQL_ARGS_FILE"',
    'printf "%s" "$MYSQL_PWD" > "$MYSQL_PASSWORD_FILE"',
    'cat > "$MYSQL_STDIN_FILE"',
    ''
  ].join('\n'));
  fs.chmodSync(mysqlPath, 0o755);

  const schemaEnvPath = path.join(tempDir, 'schema.env');
  fs.writeFileSync(schemaEnvPath, [
    'COMPOSE_DB_BIND=127.0.0.1',
    'COMPOSE_DB_PORT=3307',
    'COMPOSE_DB_USER=schema_user',
    'COMPOSE_DB_PASSWORD=schema_password',
    'COMPOSE_DB_NAME=aiosk_e2e_schema_env_contract',
    ''
  ].join('\n'));

  const schemaPath = path.join(tempDir, 'schema.sql');
  fs.writeFileSync(schemaPath, 'SELECT 1;\n');
  const argsPath = path.join(tempDir, 'mysql-args');
  const passwordPath = path.join(tempDir, 'mysql-password');
  const stdinPath = path.join(tempDir, 'mysql-stdin');
  const secretsDir = path.join(tempDir, 'secrets');
  const dbPasswordSecretPath = path.join(secretsDir, 'db_password');
  const schemaSecretEnvPath = path.join(tempDir, 'schema-secret.env');
  fs.mkdirSync(secretsDir);
  fs.writeFileSync(dbPasswordSecretPath, 'schema-password-from-file\n');
  fs.writeFileSync(schemaSecretEnvPath, [
    `AIOSK_SECRETS_DIR=${secretsDir}`,
    'COMPOSE_DB_BIND=127.0.0.1',
    'COMPOSE_DB_PORT=3308',
    'COMPOSE_DB_USER=schema_file_user',
    'COMPOSE_DB_PASSWORD=should-not-win',
    'COMPOSE_DB_NAME=aiosk_e2e_schema_secret_contract',
    'DB_PASSWORD_FILE=/run/secrets/db_password',
    ''
  ].join('\n'));

  try {
    const result = spawnSync('bash', ['scripts/db-apply-schema.sh', schemaPath], {
      cwd: rootDir,
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
        SCHEMA_ENV_FILE: schemaEnvPath,
        CONFIRM_SCHEMA_APPLY: 'aiosk_e2e_schema_env_contract',
        DB_HOST: '',
        DB_PORT: '',
        DB_USER: '',
        DB_PASSWORD: '',
        DB_NAME: '',
        COMPOSE_DB_HOST: '',
        MYSQL_ARGS_FILE: argsPath,
        MYSQL_PASSWORD_FILE: passwordPath,
        MYSQL_STDIN_FILE: stdinPath
      },
      encoding: 'utf8'
    });

    if (result.status !== 0) {
      throw new Error(`db-apply-schema.sh should accept SCHEMA_ENV_FILE with COMPOSE_DB_* fallbacks:\n${result.stdout}\n${result.stderr}`);
    }

    const mysqlArgs = fs.readFileSync(argsPath, 'utf8');
    if (!mysqlArgs.includes('-h 127.0.0.1') || !mysqlArgs.includes('-P 3307') || !mysqlArgs.includes('-u schema_user') || !mysqlArgs.includes('aiosk_e2e_schema_env_contract')) {
      throw new Error(`db-apply-schema.sh did not pass expected mysql args from compose env:\n${mysqlArgs}`);
    }
    if (fs.readFileSync(passwordPath, 'utf8') !== 'schema_password') {
      throw new Error('db-apply-schema.sh did not pass COMPOSE_DB_PASSWORD through MYSQL_PWD.');
    }
    if (fs.readFileSync(stdinPath, 'utf8') !== 'SELECT 1;\n') {
      throw new Error('db-apply-schema.sh did not stream the requested schema file to mysql.');
    }

    const secretResult = spawnSync('bash', ['scripts/db-apply-schema.sh', schemaPath], {
      cwd: rootDir,
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
        SCHEMA_ENV_FILE: schemaSecretEnvPath,
        CONFIRM_SCHEMA_APPLY: 'aiosk_e2e_schema_secret_contract',
        DB_HOST: '',
        DB_PORT: '',
        DB_USER: '',
        DB_PASSWORD: '',
        DB_PASSWORD_FILE: '',
        DB_NAME: '',
        COMPOSE_DB_HOST: '',
        MYSQL_ARGS_FILE: argsPath,
        MYSQL_PASSWORD_FILE: passwordPath,
        MYSQL_STDIN_FILE: stdinPath
      },
      encoding: 'utf8'
    });

    if (secretResult.status !== 0) {
      throw new Error(`db-apply-schema.sh should load DB_PASSWORD_FILE through AIOSK_SECRETS_DIR:\n${secretResult.stdout}\n${secretResult.stderr}`);
    }
    if (fs.readFileSync(passwordPath, 'utf8') !== 'schema-password-from-file') {
      throw new Error('db-apply-schema.sh did not pass DB_PASSWORD_FILE through MYSQL_PWD.');
    }

    const conflictResult = spawnSync('bash', ['scripts/db-backup.sh', path.join(tempDir, 'backup.sql.gz')], {
      cwd: rootDir,
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
        BACKUP_ENV_FILE: '/dev/null',
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        DB_USER: 'root',
        DB_PASSWORD: 'inline-password',
        DB_PASSWORD_FILE: dbPasswordSecretPath,
        DB_NAME: 'aiosk_e2e_backup_secret_conflict',
        COMPOSE_DB_HOST: '',
        COMPOSE_DB_BIND: '',
        COMPOSE_DB_PORT: '',
        COMPOSE_DB_USER: '',
        COMPOSE_DB_PASSWORD: '',
        COMPOSE_DB_NAME: ''
      },
      encoding: 'utf8'
    });

    if (conflictResult.status === 0 || !`${conflictResult.stdout}\n${conflictResult.stderr}`.includes('DB_PASSWORD and DB_PASSWORD_FILE must not both be set.')) {
      throw new Error(`DB shell scripts should reject DB_PASSWORD and DB_PASSWORD_FILE conflicts before mysql clients:\n${conflictResult.stdout}\n${conflictResult.stderr}`);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('ok db shell compose env contracts');
};

const verifyDbMigrationEnvContract = () => {
  const migrateSource = fs.readFileSync(path.join(rootDir, 'scripts/db-migrate.js'), 'utf8');
  const runbookSource = fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');

  if (!/const migrationEnvFile = process\.env\.MIGRATION_ENV_FILE/.test(migrateSource) || !/dotenv'\)\.config\(migrationEnvFile \? \{ path: migrationEnvFile \} : undefined\)/.test(migrateSource)) {
    throw new Error('db-migrate.js must support MIGRATION_ENV_FILE for production env files.');
  }
  if (
    /const getComposeDbHost\s*=|getComposeDbHost\(/.test(migrateSource) ||
    !/const composeDbHost = process\.env\.COMPOSE_DB_HOST \|\|[\s\S]*process\.env\.COMPOSE_DB_BIND === '0\.0\.0\.0'[\s\S]*\? '127\.0\.0\.1'[\s\S]*: process\.env\.COMPOSE_DB_BIND[\s\S]*host:\s*process\.env\.DB_HOST \|\| composeDbHost \|\| 'localhost'/.test(migrateSource)
  ) {
    throw new Error('db-migrate.js must inline COMPOSE_DB_BIND host mapping without a single-use getComposeDbHost helper.');
  }
  if (!/process\.env\.DB_PORT \|\| process\.env\.COMPOSE_DB_PORT/.test(migrateSource)) {
    throw new Error('db-migrate.js must use COMPOSE_DB_PORT as a fallback.');
  }
  if (
    /Number\(process\.env\.DB_PORT \|\| process\.env\.COMPOSE_DB_PORT \|\| 3306\)/.test(migrateSource) ||
    !/const normalizeDatabasePort = \(value\) => \{[\s\S]*const rawPort = value === undefined \|\| value === '' \? 3306 : value;[\s\S]*const portText = typeof rawPort === 'number' \? String\(rawPort\) : String\(rawPort\)\.trim\(\);[\s\S]*const port = \/\^\[1-9\]\[0-9\]\*\$\/\.test\(portText\) \? Number\(portText\) : null;[\s\S]*if \(!Number\.isSafeInteger\(port\) \|\| port > 65535\) \{[\s\S]*DB_PORT\/COMPOSE_DB_PORT must be a positive integer between 1 and 65535/.test(migrateSource) ||
    !/const databasePort = normalizeDatabasePort\(process\.env\.DB_PORT \|\| process\.env\.COMPOSE_DB_PORT\);/.test(migrateSource) ||
    !/port:\s*databasePort/.test(migrateSource)
  ) {
    throw new Error('db-migrate.js must strictly normalize DB_PORT/COMPOSE_DB_PORT without partial numeric parsing.');
  }
  if (!/process\.env\.DB_USER \|\| process\.env\.COMPOSE_DB_USER/.test(migrateSource)) {
    throw new Error('db-migrate.js must use COMPOSE_DB_USER as a fallback.');
  }
  if (!/process\.env\.DB_PASSWORD \|\| process\.env\.COMPOSE_DB_PASSWORD/.test(migrateSource)) {
    throw new Error('db-migrate.js must use COMPOSE_DB_PASSWORD as a fallback.');
  }
  if (!/process\.env\.DB_NAME \|\| process\.env\.COMPOSE_DB_NAME/.test(migrateSource)) {
    throw new Error('db-migrate.js must use COMPOSE_DB_NAME as a fallback.');
  }
  if (
    /const assertDatabaseConfigured\s*=|assertDatabaseConfigured\(/.test(migrateSource) ||
    !/const main = async \(\) => \{[\s\S]*config = \{[\s\S]*database:\s*process\.env\.DB_NAME \|\| process\.env\.COMPOSE_DB_NAME \|\| ''[\s\S]*\};[\s\S]*if \(!config\.database\) \{\s*throw new Error\('DB_NAME is required\.'\);\s*\}[\s\S]*const migrations = loadMigrations\(\);[\s\S]*const connection = await connect\(\);/.test(migrateSource)
  ) {
    throw new Error('db-migrate.js must inline DB_NAME validation before loading migrations or connecting.');
  }
  if (
    !/const parsePositiveInteger = \(value, fallback\) => \{[\s\S]*if \(value === undefined\) return fallback;[\s\S]*if \(!\/\^\[1-9\]\[0-9\]\*\$\/\.test\(value\)\) \{[\s\S]*Expected a positive integer[\s\S]*const parsed = Number\(value\);[\s\S]*if \(!Number\.isSafeInteger\(parsed\)\) \{[\s\S]*Expected a positive integer[\s\S]*return parsed;[\s\S]*\};/.test(migrateSource)
  ) {
    throw new Error('db-migrate.js must reject unsafe up/down migration count arguments before using them in SQL or loops.');
  }
  if (!/const commandArgs = process\.argv\.slice\(3\);\s*const commandArg = commandArgs\[0\];/.test(migrateSource)) {
    throw new Error('db-migrate.js must parse migration command arguments from a bounded argv slice.');
  }
  const unknownCommandGuardIndex = migrateSource.indexOf("if (!['status', 'up', 'down'].includes(command))");
  const statusExtraArgGuardIndex = migrateSource.indexOf("if (command === 'status' && commandArgs.length > 0)");
  const extraArgGuardIndex = migrateSource.indexOf("if ((command === 'up' || command === 'down') && commandArgs.length > 1)");
  const migrationLimitIndex = migrateSource.indexOf('const migrationLimit = command ===');
  const rollbackCountIndex = migrateSource.indexOf('const rollbackCount = command ===');
  const portNormalizationIndex = migrateSource.indexOf('const databasePort = normalizeDatabasePort');
  const connectionIndex = migrateSource.indexOf('const connection = await connect()');
  if (
    unknownCommandGuardIndex === -1 ||
    statusExtraArgGuardIndex === -1 ||
    extraArgGuardIndex === -1 ||
    !/if \(!\['status', 'up', 'down'\]\.includes\(command\)\) \{\s*usage\(\);\s*process\.exitCode = 1;\s*return;\s*\}/.test(migrateSource) ||
    !migrateSource.includes('console.error(`Unexpected argument for status: ${commandArgs[0]}.`);') ||
    !migrateSource.includes('console.error(`Unexpected extra argument: ${commandArgs[1]}.`);') ||
    portNormalizationIndex === -1 ||
    connectionIndex === -1 ||
    migrationLimitIndex === -1 ||
    rollbackCountIndex === -1 ||
    unknownCommandGuardIndex > portNormalizationIndex ||
    unknownCommandGuardIndex > connectionIndex ||
    unknownCommandGuardIndex > statusExtraArgGuardIndex ||
    unknownCommandGuardIndex > extraArgGuardIndex ||
    statusExtraArgGuardIndex > migrationLimitIndex ||
    statusExtraArgGuardIndex > rollbackCountIndex ||
    statusExtraArgGuardIndex > portNormalizationIndex ||
    statusExtraArgGuardIndex > connectionIndex ||
    extraArgGuardIndex > migrationLimitIndex ||
    extraArgGuardIndex > rollbackCountIndex ||
    extraArgGuardIndex > portNormalizationIndex ||
    extraArgGuardIndex > connectionIndex ||
    migrationLimitIndex > portNormalizationIndex ||
    rollbackCountIndex > portNormalizationIndex ||
    migrationLimitIndex > connectionIndex ||
    rollbackCountIndex > connectionIndex ||
    !/const migrationLimit = command === 'up' \? parsePositiveInteger\(commandArg, Number\.POSITIVE_INFINITY\) : null;/.test(migrateSource) ||
    !/const rollbackCount = command === 'down' \? parsePositiveInteger\(commandArg, 1\) : null;/.test(migrateSource)
  ) {
    throw new Error('db-migrate.js must reject unknown commands and invalid up/down count arguments before parsing DB config or connecting.');
  }
  if (!/const getMigrationDrift = \(migrations, appliedRows\) =>/.test(migrateSource) || !/const assertNoMigrationDrift = \(migrations, appliedRows\) =>/.test(migrateSource)) {
    throw new Error('db-migrate.js must detect changed and orphaned migration history before mutating schema.');
  }
  if (
    !/const migrationFilePattern = \/\^\[0-9\]\{12,\}_\[a-z0-9_\]\+\\\.\(up\|down\)\\\.sql\$\/;/.test(migrateSource) ||
    !/const entries = fs\.readdirSync\(migrationsDir, \{ withFileTypes: true \}\);/.test(migrateSource) ||
    !/const unexpectedEntries = entries[\s\S]*\.filter\(\(entry\) => !entry\.isFile\(\) \|\| !migrationFilePattern\.test\(entry\.name\)\)[\s\S]*\.map\(\(entry\) => entry\.name\);/.test(migrateSource) ||
    !/Unexpected migration directory entry: \$\{unexpectedEntries\.join\(', '\)\}/.test(migrateSource) ||
    !/const files = entries\.map\(\(entry\) => entry\.name\);/.test(migrateSource) ||
    !/const upFiles = files\.filter\(\(file\) => \/\^\[0-9\]\{12,\}_\[a-z0-9_\]\+\\\.up\\\.sql\$\/\.test\(file\)\);/.test(migrateSource) ||
    !/const downFiles = new Set\(files\.filter\(\(file\) => \/\^\[0-9\]\{12,\}_\[a-z0-9_\]\+\\\.down\\\.sql\$\/\.test\(file\)\)\);/.test(migrateSource) ||
    !/Down migration not found: \$\{downFile\}/.test(migrateSource) ||
    !/Down migration has no matching up migration: \$\{downFile\}/.test(migrateSource) ||
    /downSql: fs\.existsSync\(downPath\)/.test(migrateSource) ||
    /if \(!migration\.downSql\)/.test(migrateSource) ||
    /if \(!match\) return null;/.test(migrateSource) ||
    /\.map\(parseMigrationFile\)\s*\.filter\(Boolean\)/.test(migrateSource)
  ) {
    throw new Error('db-migrate.js must validate migration files while loading migrations instead of keeping unreachable parse or rollback fallbacks.');
  }
  const migrationsDir = path.join(rootDir, 'database/migrations');
  const migrationEntries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const unexpectedMigrationEntries = migrationEntries
    .filter((entry) => !entry.isFile() || !/^[0-9]{12,}_[a-z0-9_]+\.(up|down)\.sql$/.test(entry.name))
    .map((entry) => entry.name);
  if (unexpectedMigrationEntries.length > 0) {
    throw new Error(`Unexpected migration entries: ${unexpectedMigrationEntries.join(', ')}`);
  }
  const migrationFiles = migrationEntries.map((entry) => entry.name);
  const upFiles = migrationFiles.filter((file) => /^[0-9]{12,}_[a-z0-9_]+\.up\.sql$/.test(file));
  const downFiles = new Set(migrationFiles.filter((file) => /^[0-9]{12,}_[a-z0-9_]+\.down\.sql$/.test(file)));
  const upFileSet = new Set(upFiles);
  upFiles.forEach((upFile) => {
    const downFile = upFile.replace(/\.up\.sql$/, '.down.sql');
    if (!downFiles.has(downFile)) {
      throw new Error(`Migration ${upFile} must have matching ${downFile}.`);
    }
  });
  downFiles.forEach((downFile) => {
    const upFile = downFile.replace(/\.down\.sql$/, '.up.sql');
    if (!upFileSet.has(upFile)) {
      throw new Error(`Migration ${downFile} must have matching ${upFile}.`);
    }
  });
  if (
    /const migrationId\s*=|migrationId\(/.test(migrateSource) ||
    !/changed\.push\(`\$\{migration\.version\}_\$\{migration\.name\}`\)/.test(migrateSource)
  ) {
    throw new Error('db-migrate.js must inline changed migration labels without a single-use migrationId helper.');
  }
  if (!/const runUp = async \(connection, migrations, limit\) => \{[\s\S]*?assertNoMigrationDrift\(migrations, appliedRows\)/.test(migrateSource)) {
    throw new Error('db-migrate.js up must refuse to run when migration history has drift.');
  }
  if (!/const runDown = async \(connection, migrations, count\) => \{[\s\S]*?assertNoMigrationDrift\(migrations, appliedRows\)/.test(migrateSource)) {
    throw new Error('db-migrate.js down must refuse to run when migration history has drift.');
  }
  if (!/MIGRATION_ENV_FILE=\/path\/to\/env/.test(migrateSource)) {
    throw new Error('db-migrate.js usage must document MIGRATION_ENV_FILE.');
  }
  if (!/DB_PASSWORD_FILE=\/run\/secrets\/db_password is accepted for the DB password\./.test(migrateSource)) {
    throw new Error('db-migrate.js usage must document DB_PASSWORD_FILE support for DB password.');
  }
  if (!/COMPOSE_DB_BIND/.test(`${runbookSource}\n${readmeSource}`)) {
    throw new Error('runbook or README must document COMPOSE_DB_BIND support for host-side DB operations.');
  }
  if (!/MIGRATION_ENV_FILE=\.env\.production npm run db:migrate:status/.test(`${runbookSource}\n${readmeSource}`)) {
    throw new Error('runbook or README must document production migration status with MIGRATION_ENV_FILE=.env.production.');
  }
  if (!/migration history drift/.test(`${runbookSource}\n${readmeSource}`) || !/orphaned/.test(`${runbookSource}\n${readmeSource}`)) {
    throw new Error('runbook or README must document that mutating migrations fail on migration history drift.');
  }
  if (!/unknown migration commands fail before DB config parsing/.test(`${runbookSource}\n${readmeSource}\n${fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8')}`)) {
    throw new Error('docs must record that unknown migration commands fail before DB setup.');
  }
  if (!/unexpected migration CLI arguments fail before DB config parsing/.test(`${runbookSource}\n${readmeSource}\n${fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8')}`)) {
    throw new Error('docs must record that unexpected migration CLI arguments fail before DB setup.');
  }
  if (!/migration up\/down count arguments must be safe positive integers/.test(`${runbookSource}\n${readmeSource}\n${fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8')}`)) {
    throw new Error('docs must record that migration up/down count arguments are safe positive integers.');
  }
  if (!/matching `\*\.down\.sql`/.test(`${runbookSource}\n${readmeSource}\n${fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8')}`)) {
    throw new Error('docs must record that migration up/down file pairs are validated before DB connection.');
  }
  if (!/예상 형식 밖의 파일이나 하위 디렉터리/.test(`${runbookSource}\n${readmeSource}\n${fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8')}`)) {
    throw new Error('docs must record that unexpected migration directory entries are rejected before DB connection.');
  }

  const unknownCommandResult = spawnSync(process.execPath, ['scripts/db-migrate.js', 'typo'], {
    cwd: rootDir,
    env: {
      ...process.env,
      DB_HOST: '',
      DB_PORT: '',
      DB_USER: '',
      DB_PASSWORD: '',
      DB_NAME: '',
      COMPOSE_DB_HOST: '',
      COMPOSE_DB_BIND: '',
      COMPOSE_DB_PORT: '',
      COMPOSE_DB_USER: '',
      COMPOSE_DB_PASSWORD: '',
      COMPOSE_DB_NAME: ''
    },
    encoding: 'utf8',
    timeout: 10000
  });

  if (
    unknownCommandResult.status === 0 ||
    !`${unknownCommandResult.stdout}\n${unknownCommandResult.stderr}`.includes('Usage:') ||
    `${unknownCommandResult.stdout}\n${unknownCommandResult.stderr}`.includes('DB_NAME is required.')
  ) {
    throw new Error(`db-migrate.js should reject unknown commands before DB config validation:\n${unknownCommandResult.stdout}\n${unknownCommandResult.stderr}`);
  }

  [
    [['status', 'extra'], 'Unexpected argument for status: extra.'],
    [['up', '1', 'extra'], 'Unexpected extra argument: extra.'],
    [['down', '1', 'extra'], 'Unexpected extra argument: extra.']
  ].forEach(([args, expectedMessage]) => {
    const result = spawnSync(process.execPath, ['scripts/db-migrate.js', ...args], {
      cwd: rootDir,
      env: {
        ...process.env,
        DB_HOST: '',
        DB_PORT: '',
        DB_USER: '',
        DB_PASSWORD: '',
        DB_NAME: '',
        COMPOSE_DB_HOST: '',
        COMPOSE_DB_BIND: '',
        COMPOSE_DB_PORT: '',
        COMPOSE_DB_USER: '',
        COMPOSE_DB_PASSWORD: '',
        COMPOSE_DB_NAME: ''
      },
      encoding: 'utf8',
      timeout: 10000
    });

    if (
      result.status === 0 ||
      !`${result.stdout}\n${result.stderr}`.includes(expectedMessage) ||
      !`${result.stdout}\n${result.stderr}`.includes('Usage:') ||
      `${result.stdout}\n${result.stderr}`.includes('DB_NAME is required.')
    ) {
      throw new Error(`db-migrate.js should reject unexpected CLI arguments before DB config validation:\n${result.stdout}\n${result.stderr}`);
    }
  });

  [
    ['up', '999999999999999999999999999999999999999999999999'],
    ['down', '999999999999999999999999999999999999999999999999']
  ].forEach(([subcommand, countArg]) => {
    const result = spawnSync(process.execPath, ['scripts/db-migrate.js', subcommand, countArg], {
      cwd: rootDir,
      env: {
        ...process.env,
        DB_HOST: '',
        DB_PORT: '',
        DB_USER: '',
        DB_PASSWORD: '',
        DB_NAME: '',
        COMPOSE_DB_HOST: '',
        COMPOSE_DB_BIND: '',
        COMPOSE_DB_PORT: '',
        COMPOSE_DB_USER: '',
        COMPOSE_DB_PASSWORD: '',
        COMPOSE_DB_NAME: ''
      },
      encoding: 'utf8',
      timeout: 10000
    });

    if (
      result.status === 0 ||
      !`${result.stdout}\n${result.stderr}`.includes(`Expected a positive integer, got: ${countArg}`) ||
      `${result.stdout}\n${result.stderr}`.includes('DB_NAME is required.')
    ) {
      throw new Error(`db-migrate.js should reject unsafe ${subcommand} count arguments before DB config validation:\n${result.stdout}\n${result.stderr}`);
    }
  });

  const missingDownScript = `
const path = require('path');
const fs = require('fs');
const Module = require('module');
const originalExistsSync = fs.existsSync;
const originalReaddirSync = fs.readdirSync;
const originalReadFileSync = fs.readFileSync;
const originalLoad = Module._load;
const isMigrationsDir = (target) => String(target).endsWith(path.join('database', 'migrations'));
const fileEntry = (name) => ({ name, isFile: () => true });
fs.existsSync = (target) => isMigrationsDir(target) ? true : originalExistsSync.call(fs, target);
fs.readdirSync = (target, ...args) => isMigrationsDir(target) ? [fileEntry('202605280003_missing_down.up.sql')] : originalReaddirSync.call(fs, target, ...args);
fs.readFileSync = (target, ...args) => String(target).endsWith('202605280003_missing_down.up.sql') ? 'CREATE TABLE missing_down (id INT);' : originalReadFileSync.call(fs, target, ...args);
Module._load = (request, parent, isMain) => {
  if (request === 'mysql2/promise') {
    return {
      createConnection: async () => {
        throw new Error('migration runner should validate up/down file pairs before connecting');
      }
    };
  }
  return originalLoad(request, parent, isMain);
};
process.argv = ['node', 'scripts/db-migrate.js', 'status'];
require('./scripts/db-migrate.js');
`;
  const missingDownResult = spawnSync(process.execPath, ['-e', missingDownScript], {
    cwd: rootDir,
    env: {
      ...process.env,
      DB_NAME: 'aiosk_e2e_migration_pair',
      DB_HOST: '127.0.0.1',
      DB_PORT: '1',
      DB_USER: 'root',
      DB_PASSWORD: 'root'
    },
    encoding: 'utf8',
    timeout: 10000
  });

  if (
    missingDownResult.status === 0 ||
    !`${missingDownResult.stdout}\n${missingDownResult.stderr}`.includes('Down migration not found: 202605280003_missing_down.down.sql') ||
    `${missingDownResult.stdout}\n${missingDownResult.stderr}`.includes('migration runner should validate up/down file pairs before connecting')
  ) {
    throw new Error(`db-migrate.js should reject missing down migration files before connecting:\n${missingDownResult.stdout}\n${missingDownResult.stderr}`);
  }

  const unexpectedMigrationFileScript = `
const path = require('path');
const fs = require('fs');
const Module = require('module');
const originalExistsSync = fs.existsSync;
const originalReaddirSync = fs.readdirSync;
const originalLoad = Module._load;
const isMigrationsDir = (target) => String(target).endsWith(path.join('database', 'migrations'));
const fileEntry = (name) => ({ name, isFile: () => true });
fs.existsSync = (target) => isMigrationsDir(target) ? true : originalExistsSync.call(fs, target);
fs.readdirSync = (target, ...args) => isMigrationsDir(target) ? [fileEntry('README.md')] : originalReaddirSync.call(fs, target, ...args);
Module._load = (request, parent, isMain) => {
  if (request === 'mysql2/promise') {
    return {
      createConnection: async () => {
        throw new Error('migration runner should reject unexpected migration directory entries before connecting');
      }
    };
  }
  return originalLoad(request, parent, isMain);
};
process.argv = ['node', 'scripts/db-migrate.js', 'status'];
require('./scripts/db-migrate.js');
`;
  const unexpectedMigrationFileResult = spawnSync(process.execPath, ['-e', unexpectedMigrationFileScript], {
    cwd: rootDir,
    env: {
      ...process.env,
      DB_NAME: 'aiosk_e2e_migration_bad_file',
      DB_HOST: '127.0.0.1',
      DB_PORT: '1',
      DB_USER: 'root',
      DB_PASSWORD: 'root'
    },
    encoding: 'utf8',
    timeout: 10000
  });

  if (
    unexpectedMigrationFileResult.status === 0 ||
    !`${unexpectedMigrationFileResult.stdout}\n${unexpectedMigrationFileResult.stderr}`.includes('Unexpected migration directory entry: README.md') ||
    `${unexpectedMigrationFileResult.stdout}\n${unexpectedMigrationFileResult.stderr}`.includes('migration runner should reject unexpected migration directory entries before connecting')
  ) {
    throw new Error(`db-migrate.js should reject unexpected migration directory entries before connecting:\n${unexpectedMigrationFileResult.stdout}\n${unexpectedMigrationFileResult.stderr}`);
  }

  const hostMappingScript = `
const Module = require('module');
const originalLoad = Module._load;
Module._load = (request, parent, isMain) => {
  if (request === 'mysql2/promise') {
    return {
      createConnection: async (options) => {
        if (options.host !== '127.0.0.1') {
          throw new Error('expected COMPOSE_DB_BIND=0.0.0.0 to map to 127.0.0.1, got ' + options.host);
        }
        if (options.port !== 3307 || options.user !== 'compose_user' || options.password !== 'compose_password' || options.database !== 'aiosk_e2e_migration_bind') {
          throw new Error('expected db-migrate.js to pass COMPOSE_DB_* fallback connection options');
        }
        return {
          query: async (sql) => {
            if (/SELECT version, name, checksum, applied_at FROM SchemaMigrations/.test(sql)) {
              return [[]];
            }
            return [[]];
          },
          end: async () => {}
        };
      }
    };
  }
  return originalLoad(request, parent, isMain);
};
process.argv = ['node', 'scripts/db-migrate.js', 'status'];
require('./scripts/db-migrate.js');
`;
  const hostMappingResult = spawnSync(process.execPath, ['-e', hostMappingScript], {
    cwd: rootDir,
    env: {
      ...process.env,
      DB_HOST: '',
      DB_PORT: '',
      DB_USER: '',
      DB_PASSWORD: '',
      DB_NAME: '',
      COMPOSE_DB_HOST: '',
      COMPOSE_DB_BIND: '0.0.0.0',
      COMPOSE_DB_PORT: '3307',
      COMPOSE_DB_USER: 'compose_user',
      COMPOSE_DB_PASSWORD: 'compose_password',
      COMPOSE_DB_NAME: 'aiosk_e2e_migration_bind'
    },
    encoding: 'utf8',
    timeout: 10000
  });

  if (hostMappingResult.status !== 0) {
    throw new Error(`db-migrate.js should pass COMPOSE_DB_* fallback connection options:\n${hostMappingResult.stdout}\n${hostMappingResult.stderr}`);
  }

  const invalidPortCases = [
    ['partial DB_PORT', { DB_PORT: '3306abc', COMPOSE_DB_PORT: '' }],
    ['out-of-range COMPOSE_DB_PORT', { DB_PORT: '', COMPOSE_DB_PORT: '65536' }]
  ];

  invalidPortCases.forEach(([label, portEnv]) => {
    const result = spawnSync(process.execPath, ['scripts/db-migrate.js', 'status'], {
      cwd: rootDir,
      env: {
        ...process.env,
        DB_HOST: '127.0.0.1',
        DB_USER: 'root',
        DB_PASSWORD: 'root',
        DB_NAME: 'aiosk_e2e_migration_port',
        COMPOSE_DB_HOST: '',
        COMPOSE_DB_BIND: '',
        COMPOSE_DB_USER: '',
        COMPOSE_DB_PASSWORD: '',
        COMPOSE_DB_NAME: '',
        ...portEnv
      },
      encoding: 'utf8',
      timeout: 10000
    });

    if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes('DB_PORT/COMPOSE_DB_PORT must be a positive integer between 1 and 65535.')) {
      throw new Error(`db-migrate.js should reject ${label} before connecting:\n${result.stdout}\n${result.stderr}`);
    }
  });

  const driftScript = `
const Module = require('module');
const originalLoad = Module._load;
Module._load = (request, parent, isMain) => {
  if (request === 'mysql2/promise') {
    return {
      createConnection: async () => ({
        query: async (sql) => {
          if (/SELECT version, name, checksum, applied_at FROM SchemaMigrations/.test(sql)) {
            return [[{
              version: '999999999999',
              name: 'missing_local_file',
              checksum: 'orphaned-checksum',
              applied_at: new Date()
            }]];
          }
          if (/INSERT INTO SchemaMigrations/.test(sql)) {
            throw new Error('mutation should not run when migration history is orphaned');
          }
          return [[]];
        },
        end: async () => {}
      })
    };
  }
  return originalLoad(request, parent, isMain);
};
process.argv = ['node', 'scripts/db-migrate.js', 'up'];
require('./scripts/db-migrate.js');
`;
  const driftResult = spawnSync(process.execPath, ['-e', driftScript], {
    cwd: rootDir,
    env: {
      ...process.env,
      DB_NAME: 'aiosk_e2e_migration_drift',
      DB_HOST: '127.0.0.1',
      DB_PORT: '1',
      DB_USER: 'root',
      DB_PASSWORD: 'root'
    },
    encoding: 'utf8',
    timeout: 10000
  });

  if (
    driftResult.status === 0 ||
    !`${driftResult.stdout}\n${driftResult.stderr}`.includes('Refusing to mutate schema because migration history differs from local files') ||
    !`${driftResult.stdout}\n${driftResult.stderr}`.includes('orphaned: 999999999999_missing_local_file')
  ) {
    throw new Error(`db-migrate.js should fail before mutating an orphaned migration history:\n${driftResult.stdout}\n${driftResult.stderr}`);
  }

  console.log('ok db migration env contract');
};

const verifyDeployMigrationContract = () => {
  const deployComposeSource = fs.readFileSync(path.join(rootDir, 'scripts/deploy-compose.sh'), 'utf8');
  const deployRemoteSource = fs.readFileSync(path.join(rootDir, 'scripts/deploy-remote-compose.sh'), 'utf8');
  const workflowSource = fs.readFileSync(path.join(rootDir, '.github/workflows/deploy-compose.yml'), 'utf8');
  const runbookSource = fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const auditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');
  const completionSource = fs.readFileSync(path.join(rootDir, 'COMPLETION_REPORT.md'), 'utf8');
  const statusSource = fs.readFileSync(path.join(rootDir, 'PROJECT_STATUS_SUMMARY.md'), 'utf8');

  if (!/RUN_MIGRATIONS="\$\{RUN_MIGRATIONS:-1\}"/.test(deployComposeSource) || !/RUN_MIGRATIONS must be 0 or 1/.test(deployComposeSource)) {
    throw new Error('deploy-compose.sh must default DB migrations on and validate RUN_MIGRATIONS.');
  }
  if (!/MONITORING_PROFILE="\$\{MONITORING_PROFILE:-0\}"/.test(deployComposeSource) || !/MONITORING_PROFILE must be 0 or 1/.test(deployComposeSource)) {
    throw new Error('deploy-compose.sh must strictly validate MONITORING_PROFILE instead of silently skipping monitoring.');
  }
  if (!/RUN_SMOKE="\$\{RUN_SMOKE:-0\}"/.test(deployComposeSource) || !/RUN_SMOKE must be 0 or 1/.test(deployComposeSource) || !/if \[ "\$RUN_SMOKE" = "1" \]; then/.test(deployComposeSource)) {
    throw new Error('deploy-compose.sh must strictly validate RUN_SMOKE before deciding whether to run deployment smoke.');
  }
  if (!/SKIP_PREFLIGHT="\$\{SKIP_PREFLIGHT:-0\}"/.test(deployComposeSource) || !/SKIP_PREFLIGHT must be 0 or 1/.test(deployComposeSource) || !/if \[ "\$SKIP_PREFLIGHT" != "1" \]; then/.test(deployComposeSource)) {
    throw new Error('deploy-compose.sh must strictly validate SKIP_PREFLIGHT before deciding whether to run production preflight.');
  }
  if (
    !/validate_env_file_syntax\(\) \{[\s\S]*line_number=0[\s\S]*line_number=\$\(\(line_number \+ 1\)\)[\s\S]*\[\[ "\$line" =~ \^\[A-Za-z_\]\[A-Za-z0-9_\]\*= \]\][\s\S]*malformed env line \$line_number in \$ENV_FILE/.test(deployComposeSource)
  ) {
    throw new Error('deploy-compose.sh must reject malformed env lines with a line-number-only failure.');
  }
  const deployEnvSyntaxCallIndex = deployComposeSource.indexOf('\nvalidate_env_file_syntax\n');
  const deployPreflightIndex = deployComposeSource.indexOf('PREFLIGHT_ENV_FILE="$ENV_FILE"');
  const deployComposeArgsIndex = deployComposeSource.indexOf('COMPOSE_ARGS=');
  if (
    deployEnvSyntaxCallIndex === -1 ||
    deployPreflightIndex === -1 ||
    deployComposeArgsIndex === -1 ||
    deployEnvSyntaxCallIndex > deployPreflightIndex ||
    deployEnvSyntaxCallIndex > deployComposeArgsIndex
  ) {
    throw new Error('deploy-compose.sh must validate env file syntax before production preflight and docker compose commands.');
  }
  if (!/if \[ "\$#" -ne 0 \]; then\s+echo "Usage: \$0" >&2\s+exit 1\s+fi/.test(deployComposeSource)) {
    throw new Error('deploy-compose.sh must reject unexpected positional arguments before local deploy work.');
  }
  if (!/wait_for_database/.test(deployComposeSource) || !/ps -q db/.test(deployComposeSource) || !/docker inspect -f/.test(deployComposeSource)) {
    throw new Error('deploy-compose.sh must wait for database readiness before running migrations.');
  }
  if (!/docker compose "\$\{COMPOSE_ARGS\[@\]\}" up -d db/.test(deployComposeSource)) {
    throw new Error('deploy-compose.sh must start the database service before migrations.');
  }
  if (
    !/read_env_value COMPOSE_DB_NAME/.test(deployComposeSource) ||
    !/CONFIRM_MIGRATION_APPLY=\$MIGRATION_DB_NAME/.test(deployComposeSource) ||
    !/backend node scripts\/db-migrate\.js up/.test(deployComposeSource)
  ) {
    throw new Error('deploy-compose.sh must run backend migrations with the confirmed compose DB name.');
  }
  if (!/Skipping database migrations because RUN_MIGRATIONS=0/.test(deployComposeSource)) {
    throw new Error('deploy-compose.sh must log the explicit migration skip path.');
  }

  if (
    !/RUN_MIGRATIONS="\$\{RUN_MIGRATIONS:-1\}"/.test(deployRemoteSource) ||
    !/RUN_MIGRATIONS_Q="\$\(printf '%q' "\$RUN_MIGRATIONS"\)"/.test(deployRemoteSource) ||
    !/RUN_MIGRATIONS=\$RUN_MIGRATIONS_Q/.test(deployRemoteSource) ||
    !/RUN_MIGRATIONS="\$RUN_MIGRATIONS"/.test(deployRemoteSource)
  ) {
    throw new Error('deploy-remote-compose.sh must validate and pass RUN_MIGRATIONS through to the remote rollout.');
  }
  if (
    !/RUN_SMOKE="\$\{RUN_SMOKE:-0\}"/.test(deployRemoteSource) ||
    !/RUN_SMOKE_Q="\$\(printf '%q' "\$RUN_SMOKE"\)"/.test(deployRemoteSource) ||
    !/SMOKE_BASE_URL_Q="\$\(printf '%q' "\$SMOKE_BASE_URL"\)"/.test(deployRemoteSource) ||
    !/RUN_SMOKE=\$RUN_SMOKE_Q/.test(deployRemoteSource) ||
    !/SMOKE_BASE_URL=\$SMOKE_BASE_URL_Q/.test(deployRemoteSource) ||
    !/RUN_SMOKE="\$RUN_SMOKE"/.test(deployRemoteSource) ||
    !/SMOKE_BASE_URL="\$SMOKE_BASE_URL"/.test(deployRemoteSource)
  ) {
    throw new Error('deploy-remote-compose.sh must validate and pass RUN_SMOKE/SMOKE_BASE_URL through to the remote rollout.');
  }
  if (
    !/if ! \[\[ "\$DEPLOY_SSH_PORT" =~ \^\[1-9\]\[0-9\]\*\$ \]\] \|\| \[ "\$\{#DEPLOY_SSH_PORT\}" -gt 5 \] \|\| \[ "\$DEPLOY_SSH_PORT" -gt 65535 \]; then\s+echo "DEPLOY_SSH_PORT must be a positive integer between 1 and 65535\." >&2\s+exit 1\s+fi/.test(deployRemoteSource)
  ) {
    throw new Error('deploy-remote-compose.sh must strictly validate DEPLOY_SSH_PORT before SSH commands.');
  }
  if (
    !/SSH_KEY_FILE must point to a readable non-empty file\./.test(deployRemoteSource) ||
    !/SSH_KNOWN_HOSTS_FILE must point to a readable non-empty file\./.test(deployRemoteSource)
  ) {
    throw new Error('deploy-remote-compose.sh must validate provided SSH file paths before SSH commands.');
  }
  if (!/if \[ "\$#" -ne 0 \]; then\s+echo "Usage: \$0" >&2\s+exit 1\s+fi/.test(deployRemoteSource)) {
    throw new Error('deploy-remote-compose.sh must reject unexpected positional arguments before SSH commands.');
  }
  if (
    !/backup_file="\$\{DEPLOY_ENV_FILE\}\.bak\.\$\(date \+%Y%m%d%H%M%S\)"\s+cp -p "\$DEPLOY_ENV_FILE" "\$backup_file"\s+deploy_completed=0/.test(deployRemoteSource) ||
    !/restore_env_on_failure\(\) \{[\s\S]*local exit_code="\$[\?]"[\s\S]*\[ "\$deploy_completed" = "0" \][\s\S]*cp -p "\$backup_file" "\$DEPLOY_ENV_FILE" \|\| true[\s\S]*Remote env restored from backup after failed deploy: \$backup_file[\s\S]*exit "\$exit_code"[\s\S]*\}/.test(deployRemoteSource) ||
    !/trap restore_env_on_failure EXIT[\s\S]*bash scripts\/deploy-compose\.sh\s+deploy_completed=1\s+trap - EXIT/.test(deployRemoteSource)
  ) {
    throw new Error('deploy-remote-compose.sh must restore the remote env file from backup when remote rollout fails before deploy completion.');
  }
  [
    'docker-compose.prod.yml',
    '.env.production.example',
    'database_schema.sql',
    'monitoring',
    'scripts/deploy-compose.sh',
    'scripts/db-backup.sh',
    'scripts/db-restore.sh',
    'scripts/db-restore-drill.sh',
    'scripts/db-apply-schema.sh',
    'scripts/production-preflight.sh',
    'scripts/ops-smoke.js',
    'scripts/heartbeat-soak.js',
    'deploy/systemd',
    'database/migrations'
  ].forEach((artifactPath) => {
    if (!deployRemoteSource.includes(artifactPath)) {
      throw new Error(`deploy-remote-compose.sh must copy required remote deployment artifact ${artifactPath}.`);
    }
  });
  [
    'scripts/github-environment-audit.sh',
    'scripts/github-actions-secrets-audit.sh',
    'scripts/e2e-browser.js',
    'scripts/e2e-db-api.js',
    'scripts/verify-static.js'
  ].forEach((artifactPath) => {
    if (deployRemoteSource.includes(artifactPath)) {
      throw new Error(`deploy-remote-compose.sh must not copy CI/local-only helper ${artifactPath} to the remote host.`);
    }
  });
  if (
    !/run_migrations:[\s\S]*default:\s*"1"/.test(workflowSource) ||
    !/INPUT_MONITORING_PROFILE: \$\{\{ inputs\.monitoring_profile \}\}/.test(workflowSource) ||
    !/INPUT_RUN_MIGRATIONS: \$\{\{ inputs\.run_migrations \}\}/.test(workflowSource) ||
    !/INPUT_RUN_SMOKE: \$\{\{ inputs\.run_smoke \}\}/.test(workflowSource) ||
    !/monitoring_profile must be 0 or 1/.test(workflowSource) ||
    !/run_smoke must be 0 or 1/.test(workflowSource) ||
    !/RUN_MIGRATIONS: \$\{\{ inputs\.run_migrations \}\}/.test(workflowSource) ||
    !/RUN_SMOKE: \$\{\{ inputs\.run_smoke \}\}/.test(workflowSource) ||
    !/SMOKE_BASE_URL: \$\{\{ inputs\.smoke_base_url \}\}/.test(workflowSource) ||
    !/run migrations: \$\{\{ inputs\.run_migrations \}\}/.test(workflowSource)
  ) {
    throw new Error('deploy-compose.yml must validate and pass deploy migration/smoke inputs.');
  }
  if (
    !/DEPLOY_SSH_PORT must be a positive integer between 1 and 65535\./.test(workflowSource) ||
    !/\[\[ "\$DEPLOY_SSH_PORT" =~ \^\[1-9\]\[0-9\]\*\$ \]\]/.test(workflowSource) ||
    !/\[ "\$\{#DEPLOY_SSH_PORT\}" -gt 5 \]/.test(workflowSource) ||
    !/\[ "\$DEPLOY_SSH_PORT" -gt 65535 \]/.test(workflowSource)
  ) {
    throw new Error('deploy-compose.yml must strictly validate DEPLOY_SSH_PORT before SSH setup.');
  }

  [
    ['zero SSH port', '0'],
    ['partial SSH port', '22abc'],
    ['out-of-range SSH port', '65536']
  ].forEach(([label, sshPort]) => {
    const result = spawnSync('bash', ['scripts/deploy-remote-compose.sh'], {
      cwd: rootDir,
      env: {
        ...process.env,
        DEPLOY_SSH_HOST: 'deploy.example.com',
        DEPLOY_SSH_USER: 'deploy',
        DEPLOY_SSH_PORT: sshPort,
        AIOSK_BACKEND_IMAGE: 'ghcr.io/example/aiosk-backend:v1.0.0',
        AIOSK_FRONTEND_IMAGE: 'ghcr.io/example/aiosk-frontend:v1.0.0'
      },
      encoding: 'utf8',
      timeout: 10000
    });

    if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes('DEPLOY_SSH_PORT must be a positive integer between 1 and 65535.')) {
      throw new Error(`deploy-remote-compose.sh should reject ${label} before SSH commands:\n${result.stdout}\n${result.stderr}`);
    }
  });

  const deployDocs = `${runbookSource}\n${readmeSource}\n${auditSource}\n${completionSource}\n${statusSource}`;
  if (!/RUN_MIGRATIONS=0/.test(deployDocs) || !/db-migrate\.js up/.test(deployDocs)) {
    throw new Error('docs must explain default deploy migrations, db-migrate.js up, and RUN_MIGRATIONS=0 opt-out.');
  }
  if (!/DEPLOY_SSH_PORT[^.\n]*1\.\.65535/.test(deployDocs) || !/DEPLOY_SSH_PORT must be a positive integer between 1 and 65535/.test(deployDocs)) {
    throw new Error('docs must explain the DEPLOY_SSH_PORT range guard.');
  }
  if (!/deploy shell entrypoints reject positional arguments before local or remote actions/.test(deployDocs)) {
    throw new Error('docs must record that deploy shell entrypoints reject unexpected positional arguments before local or remote actions.');
  }
  if (!/deploy remote SSH files fail before SSH commands/.test(deployDocs)) {
    throw new Error('docs must record that invalid deploy remote SSH files fail before SSH commands.');
  }
  if (!/Remote env is restored from backup after failed deploy/.test(deployDocs)) {
    throw new Error('docs must record remote env restoration after failed deploy attempts.');
  }
  if (!/SKIP_PREFLIGHT=1[^.\n]*malformed env line[^.\n]*Docker/.test(deployDocs)) {
    throw new Error('docs must record that deploy-compose rejects malformed env lines before Docker even when SKIP_PREFLIGHT=1.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-deploy-migration-'));
  const binDir = path.join(tempDir, 'bin');
  const envPath = path.join(tempDir, 'deploy.env');
  const dockerLogPath = path.join(tempDir, 'docker.log');
  const sshLogPath = path.join(tempDir, 'ssh.log');
  fs.mkdirSync(binDir);

  const fakeDockerPath = path.join(binDir, 'docker');
  fs.writeFileSync(fakeDockerPath, [
    '#!/usr/bin/env bash',
    'printf "%s\\n" "$*" >> "$DOCKER_LOG"',
    'if [ "$1" = "inspect" ]; then',
    '  printf "healthy\\n"',
    '  exit 0',
    'fi',
    'if [ "$1" = "compose" ]; then',
    '  case " $* " in',
    '    *" ps -q db "*) printf "db-container\\n" ;;',
    '  esac',
    '  exit 0',
    'fi',
    'exit 1',
    ''
  ].join('\n'));
  fs.chmodSync(fakeDockerPath, 0o755);

  const fakeSshPath = path.join(binDir, 'ssh');
  fs.writeFileSync(fakeSshPath, [
    '#!/usr/bin/env bash',
    'printf "%s\\n" "$*" >> "$SSH_LOG"',
    'exit 88',
    ''
  ].join('\n'));
  fs.chmodSync(fakeSshPath, 0o755);

  fs.writeFileSync(envPath, [
    'COMPOSE_DB_NAME=aiosk_deploy_migrate',
    'COMPOSE_MYSQL_ROOT_PASSWORD=static-root-password',
    ''
  ].join('\n'));

  const runDeployWithEnv = (envOverrides) => spawnSync('bash', ['scripts/deploy-compose.sh'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      DOCKER_LOG: dockerLogPath,
      ENV_FILE: envPath,
      COMPOSE_FILE: path.join(rootDir, 'docker-compose.prod.yml'),
      COMPOSE_PROJECT_NAME: 'aiosk-static-deploy',
      SKIP_PREFLIGHT: '1',
      RUN_MIGRATIONS: '1',
      RUN_SMOKE: '0',
      ...envOverrides
    },
    encoding: 'utf8',
    timeout: 10000
  });
  const runDeploy = (runMigrations) => runDeployWithEnv({ RUN_MIGRATIONS: runMigrations });

  try {
    [
      {
        file: 'scripts/deploy-compose.sh',
        args: ['extra'],
        env: {},
        unexpectedMessage: 'Environment file not found'
      },
      {
        file: 'scripts/deploy-remote-compose.sh',
        args: ['extra'],
        env: {},
        unexpectedMessage: 'DEPLOY_SSH_HOST is required'
      }
    ].forEach(({ file, args, env, unexpectedMessage }) => {
      fs.writeFileSync(dockerLogPath, '');
      const result = spawnSync('bash', [file, ...args], {
        cwd: rootDir,
        env: {
          ...process.env,
          PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
          DOCKER_LOG: dockerLogPath,
          ...env
        },
        encoding: 'utf8',
        timeout: 10000
      });

      if (
        result.status === 0 ||
        !`${result.stdout}\n${result.stderr}`.includes('Usage:') ||
        `${result.stdout}\n${result.stderr}`.includes(unexpectedMessage) ||
        fs.readFileSync(dockerLogPath, 'utf8')
      ) {
        throw new Error(`${file} should reject unexpected positional arguments before local or remote actions:\n${result.stdout}\n${result.stderr}`);
      }
    });

    [
      {
        label: 'missing SSH_KEY_FILE',
        env: { SSH_KEY_FILE: path.join(tempDir, 'missing-key') },
        expectedMessage: 'SSH_KEY_FILE must point to a readable non-empty file.'
      },
      {
        label: 'empty SSH_KNOWN_HOSTS_FILE',
        setup: () => {
          const knownHostsPath = path.join(tempDir, 'empty-known-hosts');
          fs.writeFileSync(knownHostsPath, '');
          return knownHostsPath;
        },
        env: {},
        expectedMessage: 'SSH_KNOWN_HOSTS_FILE must point to a readable non-empty file.'
      }
    ].forEach(({ label, setup, env, expectedMessage }) => {
      fs.writeFileSync(sshLogPath, '');
      const setupPath = setup ? setup() : null;
      const result = spawnSync('bash', ['scripts/deploy-remote-compose.sh'], {
        cwd: rootDir,
        env: {
          ...process.env,
          PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
          SSH_LOG: sshLogPath,
          DEPLOY_SSH_HOST: 'deploy.example.com',
          DEPLOY_SSH_USER: 'deploy',
          AIOSK_BACKEND_IMAGE: 'ghcr.io/example/aiosk-backend:v1.0.0',
          AIOSK_FRONTEND_IMAGE: 'ghcr.io/example/aiosk-frontend:v1.0.0',
          SSH_KEY_FILE: '',
          SSH_KNOWN_HOSTS_FILE: setupPath || '',
          ...env
        },
        encoding: 'utf8',
        timeout: 10000
      });

      if (
        result.status === 0 ||
        !`${result.stdout}\n${result.stderr}`.includes(expectedMessage) ||
        fs.readFileSync(sshLogPath, 'utf8')
      ) {
        throw new Error(`deploy-remote-compose.sh should reject ${label} before SSH commands:\n${result.stdout}\n${result.stderr}`);
      }
    });

    [
      ['MONITORING_PROFILE', 'true', 'MONITORING_PROFILE must be 0 or 1.'],
      ['RUN_MIGRATIONS', 'maybe', 'RUN_MIGRATIONS must be 0 or 1.'],
      ['RUN_SMOKE', 'true', 'RUN_SMOKE must be 0 or 1.'],
      ['SKIP_PREFLIGHT', 'true', 'SKIP_PREFLIGHT must be 0 or 1.']
    ].forEach(([envName, value, expectedMessage]) => {
      fs.writeFileSync(dockerLogPath, '');
      const invalidToggle = runDeployWithEnv({ [envName]: value });
      if (invalidToggle.status === 0 || !`${invalidToggle.stdout}\n${invalidToggle.stderr}`.includes(expectedMessage)) {
        throw new Error(`deploy-compose.sh should reject ${envName}=${value} before docker commands:\n${invalidToggle.stdout}\n${invalidToggle.stderr}`);
      }
      const invalidToggleLog = fs.readFileSync(dockerLogPath, 'utf8');
      if (invalidToggleLog) {
        throw new Error(`deploy-compose.sh should reject ${envName}=${value} before docker commands:\n${invalidToggleLog}`);
      }
    });

    fs.writeFileSync(envPath, [
      'COMPOSE_DB_NAME=aiosk_deploy_migrate',
      'NOT A VALID ENV LINE',
      ''
    ].join('\n'));
    fs.writeFileSync(dockerLogPath, '');
    const malformedEnv = runDeploy('1');
    if (malformedEnv.status === 0 || !`${malformedEnv.stdout}\n${malformedEnv.stderr}`.includes(`malformed env line 2 in ${envPath}`)) {
      throw new Error(`deploy-compose.sh should reject malformed env lines before docker commands:\n${malformedEnv.stdout}\n${malformedEnv.stderr}`);
    }
    const malformedEnvLog = fs.readFileSync(dockerLogPath, 'utf8');
    if (malformedEnvLog || /NOT A VALID ENV LINE/.test(`${malformedEnv.stdout}\n${malformedEnv.stderr}`)) {
      throw new Error(`deploy-compose.sh malformed env failure should not echo env content or reach docker commands:\n${malformedEnv.stdout}\n${malformedEnv.stderr}\n${malformedEnvLog}`);
    }

    fs.writeFileSync(envPath, [
      'COMPOSE_DB_NAME=aiosk_deploy_migrate',
      'COMPOSE_MYSQL_ROOT_PASSWORD=static-root-password',
      ''
    ].join('\n'));

    const withMigrations = runDeploy('1');
    if (withMigrations.status !== 0) {
      throw new Error(`deploy-compose.sh should run migrations in the default deploy path:\n${withMigrations.stdout}\n${withMigrations.stderr}`);
    }

    const migrationLog = fs.readFileSync(dockerLogPath, 'utf8');
    [
      / pull$/m,
      / up -d db$/m,
      / ps -q db$/m,
      /inspect -f \{\{if \.State\.Health\}\}\{\{\.State\.Health\.Status\}\}\{\{else\}\}\{\{\.State\.Status\}\}\{\{end\}\} db-container$/m,
      / run --rm --no-deps -e CONFIRM_MIGRATION_APPLY=aiosk_deploy_migrate backend node scripts\/db-migrate\.js up$/m,
      / up -d --remove-orphans$/m
    ].forEach((pattern) => {
      if (!pattern.test(migrationLog)) {
        throw new Error(`deploy-compose.sh did not invoke expected migration rollout command: ${pattern}\n${migrationLog}`);
      }
    });

    fs.writeFileSync(dockerLogPath, '');
    const skippedMigrations = runDeploy('0');
    if (skippedMigrations.status !== 0) {
      throw new Error(`deploy-compose.sh should allow RUN_MIGRATIONS=0:\n${skippedMigrations.stdout}\n${skippedMigrations.stderr}`);
    }
    const skippedLog = fs.readFileSync(dockerLogPath, 'utf8');
    if (/db-migrate\.js/.test(skippedLog) || !/Skipping database migrations because RUN_MIGRATIONS=0/.test(skippedMigrations.stdout)) {
      throw new Error(`RUN_MIGRATIONS=0 should skip migration commands:\n${skippedMigrations.stdout}\n${skippedLog}`);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('ok deploy migration contract');
};

const verifyAdminCreateEnvContract = () => {
  const createAdminSource = fs.readFileSync(path.join(rootDir, 'scripts/create-admin.js'), 'utf8');
  const runbookSource = fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const envExampleSource = fs.readFileSync(path.join(rootDir, '.env.example'), 'utf8');
  const projectAuditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');

  if (!/const adminEnvFile = process\.env\.ADMIN_ENV_FILE/.test(createAdminSource) || !/dotenv'\)\.config\(adminEnvFile \? \{ path: adminEnvFile \} : undefined\)/.test(createAdminSource)) {
    throw new Error('create-admin.js must support ADMIN_ENV_FILE for production env files.');
  }
  if (
    /const applyComposeDatabaseFallbacks\s*=|applyComposeDatabaseFallbacks\(/.test(createAdminSource) ||
    !/const composeDbHost = process\.env\.COMPOSE_DB_HOST \|\|[\s\S]*process\.env\.COMPOSE_DB_BIND !== '0\.0\.0\.0'[\s\S]*const dbEnvFallbacks = \{[\s\S]*DB_HOST:\s*composeDbHost,[\s\S]*DB_PORT:\s*process\.env\.COMPOSE_DB_PORT,[\s\S]*DB_USER:\s*process\.env\.COMPOSE_DB_USER,[\s\S]*DB_PASSWORD:\s*process\.env\.COMPOSE_DB_PASSWORD,[\s\S]*DB_NAME:\s*process\.env\.COMPOSE_DB_NAME[\s\S]*Object\.entries\(dbEnvFallbacks\)\.forEach/.test(createAdminSource)
  ) {
    throw new Error('create-admin.js must inline compose database env fallback mapping before requiring the DB pool.');
  }
  if (!/process\.env\.COMPOSE_DB_BIND/.test(createAdminSource) || !/process\.env\.COMPOSE_DB_PORT/.test(createAdminSource)) {
    throw new Error('create-admin.js must use COMPOSE_DB_BIND and COMPOSE_DB_PORT fallbacks.');
  }
  if (!/process\.env\.COMPOSE_DB_USER/.test(createAdminSource) || !/process\.env\.COMPOSE_DB_PASSWORD/.test(createAdminSource) || !/process\.env\.COMPOSE_DB_NAME/.test(createAdminSource)) {
    throw new Error('create-admin.js must use COMPOSE_DB_USER, COMPOSE_DB_PASSWORD, and COMPOSE_DB_NAME fallbacks.');
  }
  if (
    /const getCredentials\s*=|getCredentials\(|const getArgValue\s*=|getArgValue\(/.test(createAdminSource) ||
    !/const usernameArgIndex = process\.argv\.indexOf\('--username'\);[\s\S]*const passwordArgIndex = process\.argv\.indexOf\('--password'\);[\s\S]*const usernameArg = usernameArgIndex === -1 \? undefined : process\.argv\[usernameArgIndex \+ 1\];[\s\S]*const passwordArg = passwordArgIndex === -1 \? undefined : process\.argv\[passwordArgIndex \+ 1\];[\s\S]*if \(usernameArgIndex !== -1 && \(!usernameArg \|\| usernameArg\.startsWith\('--'\)\)\) \{[\s\S]*throw new Error\('--username requires a value\.'\);[\s\S]*if \(passwordArgIndex !== -1 && \(!passwordArg \|\| passwordArg\.startsWith\('--'\)\)\) \{[\s\S]*throw new Error\('--password requires a value\.'\);[\s\S]*const credentials = \{\s*username:\s*\(process\.env\.ADMIN_USERNAME \|\| usernameArg \|\| ''\)\.trim\(\),\s*password:\s*process\.env\.ADMIN_PASSWORD \|\| passwordArg \|\| ''\s*\};/.test(createAdminSource)
  ) {
    throw new Error('create-admin.js must inline admin credential extraction without single-use getCredentials/getArgValue helpers.');
  }
  if (
    !/const supportedOptions = new Set\(\['--username', '--password'\]\);/.test(createAdminSource) ||
    !/const unsupportedOption = process\.argv[\s\S]*\.slice\(2\)[\s\S]*\.find\(arg => arg\.startsWith\('--'\) && !supportedOptions\.has\(arg\)\);/.test(createAdminSource) ||
    !/throw new Error\(`Unsupported option: \$\{unsupportedOption\}\.`\);/.test(createAdminSource) ||
    !/const duplicateOption = Array\.from\(supportedOptions\)[\s\S]*\.find\(option => process\.argv\.filter\(arg => arg === option\)\.length > 1\);/.test(createAdminSource) ||
    !/throw new Error\(`Duplicate option: \$\{duplicateOption\}\.`\);/.test(createAdminSource) ||
    !/const cliArgs = process\.argv\.slice\(2\);[\s\S]*const consumedArgIndexes = new Set\(\);[\s\S]*consumedArgIndexes\.add\(index \+ 1\);[\s\S]*const unexpectedArgument = cliArgs\.find\(\(arg, index\) => !consumedArgIndexes\.has\(index\)\);[\s\S]*throw new Error\(`Unexpected argument: \$\{unexpectedArgument\}\.`\);/.test(createAdminSource)
  ) {
    throw new Error('create-admin.js must reject unsupported, duplicate, or unexpected positional CLI arguments before requiring the DB pool.');
  }
  const unexpectedArgumentGuardIndex = createAdminSource.indexOf('const unexpectedArgument = cliArgs.find');
  const dbPoolLoadIndex = createAdminSource.indexOf("sql = require('../src/models/db')");
  if (unexpectedArgumentGuardIndex === -1 || dbPoolLoadIndex === -1 || unexpectedArgumentGuardIndex > dbPoolLoadIndex) {
    throw new Error('create-admin.js must reject unexpected positional CLI arguments before requiring the DB pool.');
  }
  if (
    /const validateCredentials\s*=|validateCredentials\(/.test(createAdminSource) ||
    !/if \(!credentials\.username\) \{\s*throw new Error\('ADMIN_USERNAME or --username is required\.'\);\s*\}[\s\S]*if \(!credentials\.password\) \{\s*throw new Error\('ADMIN_PASSWORD or --password is required\.'\);\s*\}[\s\S]*if \(credentials\.password\.length < 8\) \{\s*throw new Error\('Admin password must be at least 8 characters\.'\);\s*\}[\s\S]*sql = require\('\.\.\/src\/models\/db'\);/.test(createAdminSource)
  ) {
    throw new Error('create-admin.js must inline admin credential validation before requiring the DB pool.');
  }
  if (!/ADMIN_ENV_FILE=\.env\.production ADMIN_USERNAME=admin ADMIN_PASSWORD=/.test(`${runbookSource}\n${readmeSource}`)) {
    throw new Error('runbook or README must document production admin bootstrap with ADMIN_ENV_FILE=.env.production.');
  }
  if (
    !/loadEnvFileSecrets\(\);/.test(createAdminSource) ||
    !/ADMIN_USERNAME=admin ADMIN_PASSWORD_FILE=\/run\/secrets\/admin_password npm run admin:create/.test(createAdminSource) ||
    !/DB_PASSWORD_FILE=\/run\/secrets\/db_password is accepted for the DB password\./.test(createAdminSource) ||
    !/ADMIN_PASSWORD_FILE=\/run\/secrets\/admin_password/.test(`${runbookSource}\n${readmeSource}\n${envExampleSource}`) ||
    !/`ADMIN_PASSWORD`와 `ADMIN_PASSWORD_FILE`을 동시에 설정하면 DB 연결 전에 실패/.test(runbookSource)
  ) {
    throw new Error('admin:create docs must document ADMIN_PASSWORD_FILE secret-file bootstrap and value/file conflict behavior.');
  }
  if (!/admin:create CLI fallback options require explicit values/.test(`${runbookSource}\n${readmeSource}\n${projectAuditSource}`)) {
    throw new Error('docs must record that admin:create CLI fallback options require explicit values.');
  }
  if (!/admin:create unsupported CLI options fail before DB pool loading/.test(`${runbookSource}\n${readmeSource}\n${projectAuditSource}`)) {
    throw new Error('docs must record that admin:create unsupported CLI options fail before DB pool loading.');
  }
  if (!/admin:create duplicate CLI fallback options fail before DB pool loading/.test(`${runbookSource}\n${readmeSource}\n${projectAuditSource}`)) {
    throw new Error('docs must record that admin:create duplicate CLI fallback options fail before DB pool loading.');
  }
  if (!/admin:create unexpected positional arguments fail before DB pool loading/.test(`${runbookSource}\n${readmeSource}\n${projectAuditSource}`)) {
    throw new Error('docs must record that admin:create unexpected positional arguments fail before DB pool loading.');
  }
  if (!/admin:create `ADMIN_PASSWORD_FILE` smoke/.test(projectAuditSource)) {
    throw new Error('project audit must record admin:create ADMIN_PASSWORD_FILE smoke coverage.');
  }

  const runCreateAdmin = (args, env) => spawnSync(process.execPath, ['scripts/create-admin.js', ...args], {
    cwd: rootDir,
    env: {
      ...process.env,
      ADMIN_ENV_FILE: '',
      ADMIN_USERNAME: '',
      ADMIN_PASSWORD: '',
      ADMIN_PASSWORD_FILE: '',
      AIOSK_SECRETS_DIR: '',
      DB_HOST: '',
      DB_PORT: '',
      DB_USER: '',
      DB_PASSWORD: '',
      DB_PASSWORD_FILE: '',
      DB_NAME: '',
      COMPOSE_DB_HOST: '',
      COMPOSE_DB_BIND: '',
      COMPOSE_DB_PORT: '',
      COMPOSE_DB_USER: '',
      COMPOSE_DB_PASSWORD: '',
      COMPOSE_DB_NAME: '',
      ...env
    },
    encoding: 'utf8',
    timeout: 10000
  });

  const adminSecretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-admin-secret-'));
  try {
    const adminSecretPath = path.join(adminSecretDir, 'admin_password');
    fs.writeFileSync(adminSecretPath, 'short\n');
    const shortSecretResult = runCreateAdmin([], {
      ADMIN_USERNAME: 'static_admin',
      ADMIN_PASSWORD_FILE: '/run/secrets/admin_password',
      AIOSK_SECRETS_DIR: adminSecretDir
    });
    if (
      shortSecretResult.status === 0 ||
      !`${shortSecretResult.stdout}\n${shortSecretResult.stderr}`.includes('Admin password must be at least 8 characters.') ||
      `${shortSecretResult.stdout}\n${shortSecretResult.stderr}`.includes('DB_PORT must be a positive integer')
    ) {
      throw new Error(`create-admin.js should load ADMIN_PASSWORD_FILE before DB pool loading:\n${shortSecretResult.stdout}\n${shortSecretResult.stderr}`);
    }

    fs.writeFileSync(adminSecretPath, 'strong-password-for-static-check\n');
    const conflictResult = runCreateAdmin([], {
      ADMIN_USERNAME: 'static_admin',
      ADMIN_PASSWORD: 'strong-password-for-static-check',
      ADMIN_PASSWORD_FILE: '/run/secrets/admin_password',
      AIOSK_SECRETS_DIR: adminSecretDir
    });
    if (
      conflictResult.status === 0 ||
      !`${conflictResult.stdout}\n${conflictResult.stderr}`.includes('ADMIN_PASSWORD and ADMIN_PASSWORD_FILE must not both be set.') ||
      `${conflictResult.stdout}\n${conflictResult.stderr}`.includes('DB_PORT must be a positive integer')
    ) {
      throw new Error(`create-admin.js should reject ADMIN_PASSWORD/ADMIN_PASSWORD_FILE conflicts before loading DB pool:\n${conflictResult.stdout}\n${conflictResult.stderr}`);
    }
  } finally {
    fs.rmSync(adminSecretDir, { recursive: true, force: true });
  }

  [
    {
      args: ['--username', '--password'],
      env: { ADMIN_PASSWORD: 'strong-password-for-static-check' },
      message: '--username requires a value.'
    },
    {
      args: ['--password', '--not-a-password'],
      env: { ADMIN_USERNAME: 'static_admin' },
      message: '--password requires a value.'
    },
    {
      args: ['--unknown-option'],
      env: {
        ADMIN_USERNAME: 'static_admin',
        ADMIN_PASSWORD: 'strong-password-for-static-check'
      },
      message: 'Unsupported option: --unknown-option.'
    },
    {
      args: ['--username', 'first_admin', '--username', 'second_admin'],
      env: { ADMIN_PASSWORD: 'strong-password-for-static-check' },
      message: 'Duplicate option: --username.'
    },
    {
      args: ['--password', 'strong-password-one', '--password', 'strong-password-two'],
      env: { ADMIN_USERNAME: 'static_admin' },
      message: 'Duplicate option: --password.'
    },
    {
      args: ['unexpected'],
      env: {
        ADMIN_USERNAME: 'static_admin',
        ADMIN_PASSWORD: 'strong-password-for-static-check'
      },
      message: 'Unexpected argument: unexpected.'
    },
    {
      args: ['--username', 'static_admin', 'unexpected'],
      env: { ADMIN_PASSWORD: 'strong-password-for-static-check' },
      message: 'Unexpected argument: unexpected.'
    }
  ].forEach(({ args, env, message }) => {
    const result = runCreateAdmin(args, env);

    if (
      result.status === 0 ||
      !`${result.stdout}\n${result.stderr}`.includes(message) ||
      `${result.stdout}\n${result.stderr}`.includes('DB_PORT must be a positive integer')
    ) {
      throw new Error(`create-admin.js should reject invalid CLI options before loading DB pool:\n${result.stdout}\n${result.stderr}`);
    }
  });

  console.log('ok admin create env contract');
};

const verifyProductionPreflightOperationalPasswordContract = () => {
  const preflightSource = fs.readFileSync(path.join(rootDir, 'scripts/production-preflight.sh'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const runbookSource = fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8');
  const auditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');
  const completionSource = fs.readFileSync(path.join(rootDir, 'COMPLETION_REPORT.md'), 'utf8');
  const statusSource = fs.readFileSync(path.join(rootDir, 'PROJECT_STATUS_SUMMARY.md'), 'utf8');

  if (
    !/require_operational_password\(\) \{[\s\S]*value="\$\(get_env "\$key"\)"[\s\S]*\$key must be at least 16 characters[\s\S]*\$key is still a placeholder[\s\S]*ok "operational password \$key"[\s\S]*\}/.test(preflightSource)
  ) {
    throw new Error('production preflight must validate compose-managed operational passwords without accepting *_FILE fallbacks that compose does not consume.');
  }

  [
    'COMPOSE_DB_PASSWORD',
    'COMPOSE_MYSQL_ROOT_PASSWORD',
    'GRAFANA_ADMIN_PASSWORD'
  ].forEach((envName) => {
    if (!new RegExp(`require_operational_password ${envName}`).test(preflightSource)) {
      throw new Error(`production preflight must require a strong ${envName}.`);
    }
  });

  if (/require_env (?:COMPOSE_DB_PASSWORD|COMPOSE_MYSQL_ROOT_PASSWORD|GRAFANA_ADMIN_PASSWORD)/.test(preflightSource)) {
    throw new Error('production preflight must not accept short compose DB/Grafana passwords through generic require_env.');
  }

  const docsSource = `${readmeSource}\n${runbookSource}\n${auditSource}\n${completionSource}\n${statusSource}`;
  if (!/`COMPOSE_DB_PASSWORD`, `COMPOSE_MYSQL_ROOT_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`[^.\n]*16자 이상 non-placeholder/.test(docsSource)) {
    throw new Error('docs must document the production preflight strength requirement for compose DB and Grafana passwords.');
  }
  if (!/16자 이상 compose DB\/Grafana 운영 비밀번호/.test(`${completionSource}\n${statusSource}`)) {
    throw new Error('completion/status summaries must include compose DB/Grafana operational password preflight coverage.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-preflight-operational-passwords-'));
  const binDir = path.join(tempDir, 'bin');
  const envPath = path.join(tempDir, 'env.production');
  fs.mkdirSync(binDir);

  const fakeDockerPath = path.join(binDir, 'docker');
  fs.writeFileSync(fakeDockerPath, [
    '#!/usr/bin/env bash',
    'if [ "$1" = "compose" ]; then exit 0; fi',
    'if [ "$1" = "run" ]; then exit 0; fi',
    'exit 0',
    ''
  ].join('\n'));
  fs.chmodSync(fakeDockerPath, 0o755);

  const writeEnv = (overrides) => {
    const productionEnv = fs.readFileSync(path.join(rootDir, '.env.production.example'), 'utf8');
    const nextEnv = productionEnv.split(/\r?\n/).map((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
      if (!match) return line;
      const key = match[1];
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        return `${key}=${overrides[key]}`;
      }
      if (key === 'ALLOW_OPEN_METRICS') return 'ALLOW_OPEN_METRICS=true';
      return line;
    }).join('\n');
    fs.writeFileSync(envPath, nextEnv);
    fs.chmodSync(envPath, 0o600);
  };

  const runPreflight = () => spawnSync('bash', ['scripts/production-preflight.sh'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      PREFLIGHT_ENV_FILE: envPath,
      PREFLIGHT_ALLOW_PLACEHOLDERS: '1',
      PREFLIGHT_ALLOW_LOCAL_BACKUP_ONLY: '1',
      PREFLIGHT_ALLOW_OPEN_METRICS: '1',
      PREFLIGHT_ALLOW_NOOP_ALERTS: '1'
    },
    encoding: 'utf8'
  });

  try {
    [
      'COMPOSE_DB_PASSWORD',
      'COMPOSE_MYSQL_ROOT_PASSWORD',
      'GRAFANA_ADMIN_PASSWORD'
    ].forEach((envName) => {
      writeEnv({ [envName]: 'short' });
      const result = runPreflight();
      const output = `${result.stdout}\n${result.stderr}`;
      const expectedMessage = `${envName} must be at least 16 characters`;
      if (result.status === 0 || !output.includes(expectedMessage)) {
        throw new Error(`Production preflight should reject short ${envName} values:\n${output}`);
      }
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('ok production preflight operational password contract');
};

const verifyProductionPreflightSecretFileContract = () => {
  const preflightSource = fs.readFileSync(path.join(rootDir, 'scripts/production-preflight.sh'), 'utf8');

  if (!/resolve_secret_file_path/.test(preflightSource) || !/file_path#\/run\/secrets\//.test(preflightSource) || !/AIOSK_SECRETS_DIR/.test(preflightSource)) {
    throw new Error('production preflight must resolve /run/secrets/* file envs through AIOSK_SECRETS_DIR on the compose host.');
  }
  if (/value="\$\(get_env_or_file "\$key"\)"/.test(preflightSource)) {
    throw new Error('production preflight must not record required secret failures inside command substitution.');
  }
  if (!/validate_optional_secret KIOSK_STATUS_TOKEN/.test(preflightSource)) {
    throw new Error('production preflight must validate KIOSK_STATUS_TOKEN_FILE when the optional heartbeat token is file-backed.');
  }
  if (!/\$key must be at least 16 characters when set/.test(preflightSource) || !/\$key must not contain whitespace/.test(preflightSource)) {
    throw new Error('production preflight must reject unsafe optional KIOSK_STATUS_TOKEN values.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-preflight-secret-files-'));
  const secretsDir = path.join(tempDir, 'secrets');
  const binDir = path.join(tempDir, 'bin');
  const envPath = path.join(tempDir, 'env.production');
  fs.mkdirSync(secretsDir);
  fs.mkdirSync(binDir);

  const fakeDockerPath = path.join(binDir, 'docker');
  fs.writeFileSync(fakeDockerPath, [
    '#!/usr/bin/env bash',
    'if [ "$1" = "compose" ]; then exit 0; fi',
    'if [ "$1" = "run" ]; then exit 0; fi',
    'exit 0',
    ''
  ].join('\n'));
  fs.chmodSync(fakeDockerPath, 0o755);

  const writeSecret = (name, value) => {
    fs.writeFileSync(path.join(secretsDir, name), value);
  };

  const writeEnv = (kioskStatusLines = ['KIOSK_STATUS_TOKEN=', 'KIOSK_STATUS_TOKEN_FILE=/run/secrets/aiosk_kiosk_status_token']) => {
    const productionEnv = fs.readFileSync(path.join(rootDir, '.env.production.example'), 'utf8');
    const nextEnv = productionEnv.split(/\r?\n/).flatMap((line) => {
      if (line.startsWith('JWT_SECRET=')) {
        return ['JWT_SECRET=', 'JWT_SECRET_FILE=/run/secrets/aiosk_jwt_secret'];
      }
      if (line.startsWith('SESSION_SECRET=')) {
        return ['SESSION_SECRET=', 'SESSION_SECRET_FILE=/run/secrets/aiosk_session_secret'];
      }
      if (line.startsWith('KIOSK_STATUS_TOKEN=')) {
        return kioskStatusLines;
      }
      if (line.startsWith('METRICS_TOKEN=')) {
        return ['METRICS_TOKEN=', 'METRICS_TOKEN_FILE=/run/secrets/metrics_token'];
      }
      if (line.startsWith('# AIOSK_SECRETS_DIR=')) {
        return [`AIOSK_SECRETS_DIR=${secretsDir}`];
      }
      return [line];
    }).join('\n');
    fs.writeFileSync(envPath, nextEnv);
    fs.chmodSync(envPath, 0o600);
  };

  const runPreflight = () => spawnSync('bash', ['scripts/production-preflight.sh'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      PREFLIGHT_ENV_FILE: envPath,
      PREFLIGHT_ALLOW_PLACEHOLDERS: '1',
      PREFLIGHT_ALLOW_LOCAL_BACKUP_ONLY: '1',
      PREFLIGHT_ALLOW_NOOP_ALERTS: '1'
    },
    encoding: 'utf8'
  });

  try {
    writeSecret('aiosk_jwt_secret', 'jwt-secret-from-file-at-least-32-characters');
    writeSecret('aiosk_session_secret', 'session-secret-from-file-at-least-32-characters');
    writeSecret('aiosk_kiosk_status_token', 'kiosk-status-token-from-file');
    writeSecret('metrics_token', 'metrics-token-from-file-at-least-32-characters');
    writeEnv();

    const success = runPreflight();
    if (success.status !== 0) {
      throw new Error(`Production preflight should accept compose-mounted secret files:\n${success.stdout}\n${success.stderr}`);
    }
    const successOutput = `${success.stdout}\n${success.stderr}`;
    if (!/ok secret JWT_SECRET/.test(successOutput) || !/ok secret SESSION_SECRET/.test(successOutput) || !/ok optional secret KIOSK_STATUS_TOKEN/.test(successOutput)) {
      throw new Error('Production preflight did not validate compose-mounted app secret files.');
    }

    writeEnv(['KIOSK_STATUS_TOKEN=short']);
    const weakKioskStatusToken = runPreflight();
    if (weakKioskStatusToken.status === 0 || !`${weakKioskStatusToken.stdout}\n${weakKioskStatusToken.stderr}`.includes('KIOSK_STATUS_TOKEN must be at least 16 characters when set')) {
      throw new Error('Production preflight must reject short optional KIOSK_STATUS_TOKEN values.');
    }

    writeEnv(["KIOSK_STATUS_TOKEN='valid kiosk status token'"]);
    const whitespaceKioskStatusToken = runPreflight();
    if (whitespaceKioskStatusToken.status === 0 || !`${whitespaceKioskStatusToken.stdout}\n${whitespaceKioskStatusToken.stderr}`.includes('KIOSK_STATUS_TOKEN must not contain whitespace')) {
      throw new Error('Production preflight must reject optional KIOSK_STATUS_TOKEN values with whitespace.');
    }

    writeEnv();
    fs.rmSync(path.join(secretsDir, 'aiosk_session_secret'));
    const missing = runPreflight();
    const missingOutput = `${missing.stdout}\n${missing.stderr}`;
    if (missing.status === 0 || !/SESSION_SECRET_FILE points to a missing file on the compose host/.test(missingOutput)) {
      throw new Error('Production preflight must fail nonzero when a required compose-mounted secret file is missing.');
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('ok production preflight secret file contract');
};

const verifyProductionPreflightEnvParserContract = () => {
  const preflightSource = fs.readFileSync(path.join(rootDir, 'scripts/production-preflight.sh'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const runbookSource = fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8');
  const auditSource = fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8');

  if (
    !/load_env_file\(\) \{[\s\S]*line_number=0[\s\S]*line_number=\$\(\(line_number \+ 1\)\)[\s\S]*\[\[ "\$line" =~ \^\[A-Za-z_\]\[A-Za-z0-9_\]\*= \]\][\s\S]*fail "malformed env line \$line_number in \$ENV_FILE"/.test(preflightSource)
  ) {
    throw new Error('production preflight must reject malformed env lines with a line-number-only failure.');
  }
  if (
    !/is_mysql_identifier\(\) \{[\s\S]*\[\[ "\$value" =~ \^\[A-Za-z0-9_\]\+\$ \]\][\s\S]*\}/.test(preflightSource) ||
    !/validate_database_name_policy\(\) \{[\s\S]*db_name="\$\(get_env COMPOSE_DB_NAME\)"[\s\S]*db_name="\$\{db_name:-kiosk_db\}"[\s\S]*COMPOSE_DB_NAME must contain only letters, numbers, and underscores/.test(preflightSource) ||
    preflightSource.indexOf('validate_database_name_policy') > preflightSource.indexOf('require_command docker')
  ) {
    throw new Error('production preflight must validate COMPOSE_DB_NAME as a safe identifier before docker checks.');
  }

  const docsSource = `${readmeSource}\n${runbookSource}\n${auditSource}`;
  if (!/malformed env line/.test(docsSource) || !/line number/.test(docsSource)) {
    throw new Error('README/runbook/audit must document malformed env line preflight failures without echoing env values.');
  }
  if (!/COMPOSE_DB_NAME` safe identifier/.test(docsSource)) {
    throw new Error('README/runbook/audit must document COMPOSE_DB_NAME safe identifier preflight validation.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-preflight-env-parser-'));
  const envPath = path.join(tempDir, 'env.production');
  fs.writeFileSync(envPath, 'NOT A VALID ENV LINE\n');
  fs.chmodSync(envPath, 0o600);

  try {
    const result = spawnSync('bash', ['scripts/production-preflight.sh'], {
      cwd: rootDir,
      env: {
        ...process.env,
        PREFLIGHT_ENV_FILE: envPath,
        PREFLIGHT_ALLOW_PLACEHOLDERS: '1',
        PREFLIGHT_ALLOW_LOCAL_BACKUP_ONLY: '1',
        PREFLIGHT_ALLOW_OPEN_METRICS: '1',
        PREFLIGHT_ALLOW_NOOP_ALERTS: '1'
      },
      encoding: 'utf8',
      timeout: 10000
    });
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.status === 0 || !output.includes(`malformed env line 1 in ${envPath}`)) {
      throw new Error(`Production preflight should reject malformed env lines before docker checks:\n${output}`);
    }
    if (/NOT A VALID ENV LINE|command docker|docker compose/.test(output)) {
      throw new Error(`Production preflight malformed env failure should not echo env content or reach docker checks:\n${output}`);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const invalidDbNameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-preflight-db-name-'));
  const invalidDbNameEnvPath = path.join(invalidDbNameDir, 'env.production');
  try {
    const productionEnv = fs.readFileSync(path.join(rootDir, '.env.production.example'), 'utf8');
    fs.writeFileSync(
      invalidDbNameEnvPath,
      productionEnv.replace(/^COMPOSE_DB_NAME=.*$/m, 'COMPOSE_DB_NAME=bad-name')
    );
    fs.chmodSync(invalidDbNameEnvPath, 0o600);
    const invalidDbNameResult = spawnSync('bash', ['scripts/production-preflight.sh'], {
      cwd: rootDir,
      env: {
        ...process.env,
        PREFLIGHT_ENV_FILE: invalidDbNameEnvPath,
        PREFLIGHT_ALLOW_PLACEHOLDERS: '1',
        PREFLIGHT_ALLOW_LOCAL_BACKUP_ONLY: '1',
        PREFLIGHT_ALLOW_OPEN_METRICS: '1',
        PREFLIGHT_ALLOW_NOOP_ALERTS: '1'
      },
      encoding: 'utf8',
      timeout: 10000
    });
    const invalidDbNameOutput = `${invalidDbNameResult.stdout}\n${invalidDbNameResult.stderr}`;
    if (
      invalidDbNameResult.status === 0 ||
      !invalidDbNameOutput.includes('COMPOSE_DB_NAME must contain only letters, numbers, and underscores') ||
      /command docker|docker compose/.test(invalidDbNameOutput)
    ) {
      throw new Error(`Production preflight should reject unsafe COMPOSE_DB_NAME before docker checks:\n${invalidDbNameOutput}`);
    }
  } finally {
    fs.rmSync(invalidDbNameDir, { recursive: true, force: true });
  }

  console.log('ok production preflight env parser contract');
};

const verifyProductionPreflightControlFlagContract = () => {
  const preflightSource = fs.readFileSync(path.join(rootDir, 'scripts/production-preflight.sh'), 'utf8');

  if (!/validate_binary_flag\(\) \{[\s\S]*if \[ "\$value" != "0" \] && \[ "\$value" != "1" \]; then[\s\S]*fail "\$name must be 0 or 1"[\s\S]*\}/.test(preflightSource)) {
    throw new Error('production preflight must use a shared 0/1 validator for control flags.');
  }
  [
    'PREFLIGHT_ALLOW_PLACEHOLDERS',
    'PREFLIGHT_ALLOW_OPEN_CORS',
    'PREFLIGHT_ALLOW_LATEST_IMAGE',
    'PREFLIGHT_ALLOW_LOCAL_BACKUP_ONLY',
    'PREFLIGHT_ALLOW_NOOP_ALERTS',
    'PREFLIGHT_ALLOW_OPEN_METRICS',
    'PREFLIGHT_ALLOW_WEAK_ENV_FILE_PERMS',
    'PREFLIGHT_VALIDATE_MONITORING'
  ].forEach((envName) => {
    if (!new RegExp(`validate_binary_flag ${envName} `).test(preflightSource)) {
      throw new Error(`production preflight must validate ${envName} as 0 or 1.`);
    }
  });
  const mainSource = preflightSource.slice(preflightSource.indexOf('main() {'));
  if (mainSource.indexOf('validate_control_flags') === -1 || mainSource.indexOf('require_file "$ENV_FILE"') === -1 || mainSource.indexOf('validate_control_flags') > mainSource.indexOf('require_file "$ENV_FILE"')) {
    throw new Error('production preflight must validate control flags before env file parsing and docker checks.');
  }
  if (!/validate_runtime_boolean_flag\(\) \{[\s\S]*fail "\$name must be true or false"[\s\S]*\}/.test(preflightSource)) {
    throw new Error('production preflight must validate runtime boolean env flags.');
  }
  if (!/validate_runtime_boolean_flag ALLOW_OPEN_CORS/.test(preflightSource) || !/validate_runtime_boolean_flag ALLOW_OPEN_METRICS/.test(preflightSource)) {
    throw new Error('production preflight must validate ALLOW_OPEN_CORS and ALLOW_OPEN_METRICS as true or false.');
  }
  if (
    mainSource.indexOf('load_env_file') === -1 ||
    mainSource.indexOf('validate_runtime_boolean_flags') === -1 ||
    mainSource.indexOf('require_command docker') === -1 ||
    mainSource.indexOf('validate_runtime_boolean_flags') < mainSource.indexOf('load_env_file') ||
    mainSource.indexOf('validate_runtime_boolean_flags') > mainSource.indexOf('require_command docker')
  ) {
    throw new Error('production preflight must validate runtime boolean env flags after env parsing and before docker checks.');
  }

  [
    ['PREFLIGHT_VALIDATE_MONITORING', 'true'],
    ['PREFLIGHT_ALLOW_OPEN_METRICS', 'true'],
    ['PREFLIGHT_ALLOW_PLACEHOLDERS', 'true']
  ].forEach(([envName, value]) => {
    const result = spawnSync('bash', ['scripts/production-preflight.sh'], {
      cwd: rootDir,
      env: {
        ...process.env,
        PREFLIGHT_ENV_FILE: path.join(rootDir, '.env.production.example'),
        PREFLIGHT_ALLOW_PLACEHOLDERS: '1',
        PREFLIGHT_ALLOW_LOCAL_BACKUP_ONLY: '1',
        PREFLIGHT_ALLOW_OPEN_METRICS: '1',
        PREFLIGHT_ALLOW_NOOP_ALERTS: '1',
        [envName]: value
      },
      encoding: 'utf8',
      timeout: 10000
    });
    const expectedMessage = `${envName} must be 0 or 1`;
    if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes(expectedMessage)) {
      throw new Error(`Production preflight should reject ${envName}=${value} before env parsing:\n${result.stdout}\n${result.stderr}`);
    }
    if (/command docker|docker compose/.test(`${result.stdout}\n${result.stderr}`)) {
      throw new Error(`Production preflight should reject ${envName}=${value} before docker checks:\n${result.stdout}\n${result.stderr}`);
    }
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-preflight-runtime-flags-'));
  const envPath = path.join(tempDir, 'env.production');
  const writeEnv = (overrides) => {
    const productionEnv = fs.readFileSync(path.join(rootDir, '.env.production.example'), 'utf8');
    const nextEnv = productionEnv.split(/\r?\n/).map((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
      if (!match) return line;
      const key = match[1];
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        return `${key}=${overrides[key]}`;
      }
      return line;
    }).join('\n');
    fs.writeFileSync(envPath, nextEnv);
    fs.chmodSync(envPath, 0o600);
  };

  try {
    [
      ['ALLOW_OPEN_CORS', '1'],
      ['ALLOW_OPEN_METRICS', 'yes']
    ].forEach(([envName, value]) => {
      writeEnv({ [envName]: value });
      const result = spawnSync('bash', ['scripts/production-preflight.sh'], {
        cwd: rootDir,
        env: {
          ...process.env,
          PREFLIGHT_ENV_FILE: envPath,
          PREFLIGHT_ALLOW_PLACEHOLDERS: '1',
          PREFLIGHT_ALLOW_LOCAL_BACKUP_ONLY: '1',
          PREFLIGHT_ALLOW_OPEN_METRICS: '1',
          PREFLIGHT_ALLOW_NOOP_ALERTS: '1'
        },
        encoding: 'utf8',
        timeout: 10000
      });
      const expectedMessage = `${envName} must be true or false`;
      if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes(expectedMessage)) {
        throw new Error(`Production preflight should reject ${envName}=${value} before docker checks:\n${result.stdout}\n${result.stderr}`);
      }
      if (/command docker|docker compose/.test(`${result.stdout}\n${result.stderr}`)) {
        throw new Error(`Production preflight should reject ${envName}=${value} before docker checks:\n${result.stdout}\n${result.stderr}`);
      }
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('ok production preflight control flag contract');
};

const verifyProductionPreflightNumericContract = () => {
  const preflightSource = fs.readFileSync(path.join(rootDir, 'scripts/production-preflight.sh'), 'utf8');

  if (
    !/is_positive_integer\(\) \{[\s\S]*\[\[ "\$value" =~ \^\[1-9\]\[0-9\]\*\$ \]\][\s\S]*\}/.test(preflightSource) ||
    !/is_non_negative_integer\(\) \{[\s\S]*\[\[ "\$value" =~ \^\(0\|\[1-9\]\[0-9\]\*\)\$ \]\][\s\S]*\}/.test(preflightSource) ||
    !/is_trust_proxy_value\(\) \{[\s\S]*\[\[ "\$value" =~ \^\(true\|false\|1\|0\|yes\|no\|on\|off\|\[1-9\]\[0-9\]\*\)\$ \]\][\s\S]*\}/.test(preflightSource)
  ) {
    throw new Error('production preflight must share strict numeric predicates for runtime-aligned integer validation.');
  }
  if (
    /\[\[ "\$(?:max_age|max_file_size|timeout_ms|api_window|api_max|auth_window|auth_max)" =~ \^\[0-9\]\+\$ \]\]/.test(preflightSource) ||
    /\[\[ "\$trust_proxy" =~ \^\(true\|false\|1\|0\|yes\|no\|on\|off\|\[0-9\]\+\)\$ \]\]/.test(preflightSource)
  ) {
    throw new Error('production preflight must not accept leading-zero positive integer policy values.');
  }
  if (
    !/backup_upload_raw="\$\(get_env BACKUP_UPLOAD_COMMAND\)"/.test(preflightSource) ||
    !/backup_upload="\$\(trim "\$backup_upload_raw"\)"/.test(preflightSource) ||
    !/BACKUP_UPLOAD_COMMAND must not be blank/.test(preflightSource) ||
    !/upload_command="\$\{backup_upload%%\[\[:space:\]\]\*\}"/.test(preflightSource)
  ) {
    throw new Error('production preflight must trim and reject blank BACKUP_UPLOAD_COMMAND values before accepting an offsite upload hook.');
  }
  [
    'SESSION_COOKIE_MAX_AGE_MS',
    'SESSION_CLEANUP_INTERVAL_MS',
    'MAX_FILE_SIZE',
    'READINESS_DB_TIMEOUT_MS',
    'RATE_LIMIT_WINDOW_MS',
    'RATE_LIMIT_MAX_REQUESTS',
    'AUTH_RATE_LIMIT_WINDOW_MS',
    'AUTH_RATE_LIMIT_MAX_REQUESTS',
    'SHUTDOWN_TIMEOUT_MS'
  ].forEach((envName) => {
    if (!new RegExp(`is_positive_integer "\\$${envName === 'SESSION_COOKIE_MAX_AGE_MS' ? 'max_age' : envName === 'SESSION_CLEANUP_INTERVAL_MS' ? 'cleanup_interval' : envName === 'MAX_FILE_SIZE' ? 'max_file_size' : envName === 'RATE_LIMIT_WINDOW_MS' ? 'api_window' : envName === 'RATE_LIMIT_MAX_REQUESTS' ? 'api_max' : envName === 'AUTH_RATE_LIMIT_WINDOW_MS' ? 'auth_window' : envName === 'AUTH_RATE_LIMIT_MAX_REQUESTS' ? 'auth_max' : 'timeout_ms'}"`).test(preflightSource)) {
      throw new Error(`production preflight must validate ${envName} with is_positive_integer.`);
    }
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-preflight-numeric-'));
  const binDir = path.join(tempDir, 'bin');
  const envPath = path.join(tempDir, 'env.production');
  fs.mkdirSync(binDir);

  const fakeDockerPath = path.join(binDir, 'docker');
  fs.writeFileSync(fakeDockerPath, [
    '#!/usr/bin/env bash',
    'if [ "$1" = "compose" ]; then exit 0; fi',
    'if [ "$1" = "run" ]; then exit 0; fi',
    'exit 0',
    ''
  ].join('\n'));
  fs.chmodSync(fakeDockerPath, 0o755);

  const writeEnv = (overrides) => {
    const seen = new Set();
    const productionEnv = fs.readFileSync(path.join(rootDir, '.env.production.example'), 'utf8');
    const nextEnv = productionEnv.split(/\r?\n/).map((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
      if (!match) return line;
      const key = match[1];
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        seen.add(key);
        return `${key}=${overrides[key]}`;
      }
      if (key === 'ALLOW_OPEN_METRICS') return 'ALLOW_OPEN_METRICS=true';
      return line;
    });
    Object.entries(overrides).forEach(([key, value]) => {
      if (!seen.has(key)) nextEnv.push(`${key}=${value}`);
    });
    fs.writeFileSync(envPath, nextEnv.join('\n'));
    fs.chmodSync(envPath, 0o600);
  };

  const runPreflight = () => spawnSync('bash', ['scripts/production-preflight.sh'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      PREFLIGHT_ENV_FILE: envPath,
      PREFLIGHT_ALLOW_PLACEHOLDERS: '1',
      PREFLIGHT_ALLOW_LOCAL_BACKUP_ONLY: '1',
      PREFLIGHT_ALLOW_OPEN_METRICS: '1',
      PREFLIGHT_ALLOW_NOOP_ALERTS: '1'
    },
    encoding: 'utf8'
  });

  try {
    [
      ['SESSION_CLEANUP_INTERVAL_MS', '0900000', 'SESSION_CLEANUP_INTERVAL_MS must be a positive integer'],
      ['READINESS_DB_TIMEOUT_MS', '02000', 'READINESS_DB_TIMEOUT_MS must be a positive integer'],
      ['TRUST_PROXY', '01', 'TRUST_PROXY must be boolean-like or a non-negative integer'],
      ['BACKUP_MIN_KEEP', '07', 'BACKUP_MIN_KEEP must be a non-negative integer'],
      ['BACKUP_UPLOAD_COMMAND', '"   "', 'BACKUP_UPLOAD_COMMAND must not be blank']
    ].forEach(([envName, value, expectedMessage]) => {
      writeEnv({ [envName]: value });
      const result = runPreflight();
      if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes(expectedMessage)) {
        throw new Error(`Production preflight should reject ${envName}=${value}:\n${result.stdout}\n${result.stderr}`);
      }
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('ok production preflight numeric contract');
};

const verifyProductionPreflightComposePortContract = () => {
  const preflightSource = fs.readFileSync(path.join(rootDir, 'scripts/production-preflight.sh'), 'utf8');

  if (!/is_tcp_port\(\) \{[\s\S]*is_positive_integer "\$value" && \[ "\$\{#value\}" -le 5 \] && \[ "\$value" -le 65535 \][\s\S]*\}/.test(preflightSource)) {
    throw new Error('production preflight must share a strict TCP port predicate for compose port validation.');
  }
  const mainSource = preflightSource.slice(preflightSource.indexOf('main() {'));
  const composePortCallIndex = mainSource.indexOf('validate_compose_port_policy');
  const composeConfigCallIndex = mainSource.indexOf('run_compose_config');
  if (composePortCallIndex === -1 || composeConfigCallIndex === -1 || composePortCallIndex > composeConfigCallIndex) {
    throw new Error('production preflight must run compose port validation before docker compose config.');
  }

  [
    ['COMPOSE_DB_PORT', '3306'],
    ['COMPOSE_BACKEND_PORT', '3000'],
    ['COMPOSE_FRONTEND_PORT', '5173'],
    ['COMPOSE_PROMETHEUS_PORT', '9090'],
    ['COMPOSE_ALERTMANAGER_PORT', '9093'],
    ['COMPOSE_GRAFANA_PORT', '3001']
  ].forEach(([envName, defaultValue]) => {
    if (!new RegExp(`validate_compose_port ${envName} ${defaultValue}`).test(preflightSource)) {
      throw new Error(`production preflight must validate ${envName} with its compose default.`);
    }
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-preflight-compose-ports-'));
  const binDir = path.join(tempDir, 'bin');
  const envPath = path.join(tempDir, 'env.production');
  fs.mkdirSync(binDir);

  const fakeDockerPath = path.join(binDir, 'docker');
  fs.writeFileSync(fakeDockerPath, [
    '#!/usr/bin/env bash',
    'if [ "$1" = "compose" ]; then exit 0; fi',
    'if [ "$1" = "run" ]; then exit 0; fi',
    'exit 0',
    ''
  ].join('\n'));
  fs.chmodSync(fakeDockerPath, 0o755);

  const writeEnv = (overrides) => {
    const seen = new Set();
    const productionEnv = fs.readFileSync(path.join(rootDir, '.env.production.example'), 'utf8');
    const nextEnv = productionEnv.split(/\r?\n/).map((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
      if (!match) return line;
      const key = match[1];
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        seen.add(key);
        return `${key}=${overrides[key]}`;
      }
      if (key === 'ALLOW_OPEN_METRICS') return 'ALLOW_OPEN_METRICS=true';
      return line;
    });
    Object.entries(overrides).forEach(([key, value]) => {
      if (!seen.has(key)) nextEnv.push(`${key}=${value}`);
    });
    fs.writeFileSync(envPath, nextEnv.join('\n'));
    fs.chmodSync(envPath, 0o600);
  };

  const runPreflight = () => spawnSync('bash', ['scripts/production-preflight.sh'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      PREFLIGHT_ENV_FILE: envPath,
      PREFLIGHT_ALLOW_PLACEHOLDERS: '1',
      PREFLIGHT_ALLOW_LOCAL_BACKUP_ONLY: '1',
      PREFLIGHT_ALLOW_OPEN_METRICS: '1',
      PREFLIGHT_ALLOW_NOOP_ALERTS: '1'
    },
    encoding: 'utf8'
  });

  try {
    [
      ['COMPOSE_BACKEND_PORT', '03000'],
      ['COMPOSE_PROMETHEUS_PORT', '9090abc'],
      ['COMPOSE_GRAFANA_PORT', '65536']
    ].forEach(([envName, value]) => {
      writeEnv({ [envName]: value });
      const result = runPreflight();
      const expectedMessage = `${envName} must be a positive integer between 1 and 65535`;
      if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes(expectedMessage)) {
        throw new Error(`Production preflight should reject ${envName}=${value}:\n${result.stdout}\n${result.stderr}`);
      }
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('ok production preflight compose port contract');
};

const normalizeWorkflowWorkingDirectory = (workingDirectory) => (
  (workingDirectory || '.').replace(/^['"]|['"]$/g, '').replace(/^\.\//, '').replace(/\/$/, '') || '.'
);

const extractWorkflowNpmScriptUsages = (workflowPath) => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  const lines = source.split(/\r?\n/);
  const usages = [];
  let inJobs = false;
  let inSteps = false;
  let jobDefaultWorkingDirectory = '.';
  let stepWorkingDirectory = null;
  let activeRunContext = null;

  const recordScripts = (line, lineNumber, workingDirectory) => {
    const normalizedWorkingDirectory = normalizeWorkflowWorkingDirectory(workingDirectory);
    const packageName = normalizedWorkingDirectory === 'frontend' ? 'frontend' : 'root';
    const addUsage = (script) => {
      usages.push({
        workflowPath,
        lineNumber,
        workingDirectory: normalizedWorkingDirectory,
        packageName,
        script
      });
    };

    for (const match of line.matchAll(/\bnpm\s+run(?:-script)?\s+([A-Za-z0-9:._-]+)/g)) {
      addUsage(match[1]);
    }
    for (const match of line.matchAll(/\bnpm\s+(test|start)\b/g)) {
      addUsage(match[1]);
    }
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    const indent = line.match(/^\s*/)[0].length;

    if (activeRunContext && trimmed && indent <= activeRunContext.indent) {
      activeRunContext = null;
    }
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
    }
    if (inJobs && /^  [A-Za-z0-9_-]+:\s*$/.test(line)) {
      inSteps = false;
      jobDefaultWorkingDirectory = '.';
      stepWorkingDirectory = null;
    }
    if (inJobs && /^    steps:\s*$/.test(line)) {
      inSteps = true;
      stepWorkingDirectory = null;
    }
    if (inSteps && /^      -\s+/.test(line)) {
      stepWorkingDirectory = null;
    }

    const workingDirectoryMatch = line.match(/^\s+working-directory:\s*([A-Za-z0-9_./'":-]+)\s*$/);
    if (workingDirectoryMatch) {
      if (inSteps) {
        stepWorkingDirectory = workingDirectoryMatch[1];
      } else {
        jobDefaultWorkingDirectory = workingDirectoryMatch[1];
      }
    }

    const currentWorkingDirectory = stepWorkingDirectory || jobDefaultWorkingDirectory;
    const runMatch = line.match(/^(\s*)run:\s*(.*)$/);
    if (runMatch) {
      const runIndent = runMatch[1].length;
      const runCommand = runMatch[2].trim();
      if (runCommand === '|' || runCommand === '>-') {
        activeRunContext = {
          indent: runIndent,
          workingDirectory: currentWorkingDirectory
        };
      } else {
        recordScripts(runCommand, lineNumber, currentWorkingDirectory);
      }
      return;
    }

    if (activeRunContext) {
      recordScripts(line, lineNumber, activeRunContext.workingDirectory);
    }
  });

  return usages;
};

const verifyWorkflowPackageScriptReferences = () => {
  const rootPackageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const frontendPackageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'frontend/package.json'), 'utf8'));
  const packageScripts = {
    root: rootPackageJson.scripts || {},
    frontend: frontendPackageJson.scripts || {}
  };
  const workflowPaths = walk(path.join(rootDir, '.github/workflows'), (filePath) => /\.(?:ya?ml)$/.test(filePath)).sort();
  const usages = workflowPaths.flatMap(extractWorkflowNpmScriptUsages);
  const unsupportedWorkingDirectories = usages.filter(({ workingDirectory }) => !['.', 'frontend'].includes(workingDirectory));
  if (unsupportedWorkingDirectories.length > 0) {
    throw new Error(`workflow npm scripts must run from root or frontend only: ${unsupportedWorkingDirectories.map(({ workflowPath, lineNumber, workingDirectory }) => `${relative(workflowPath)}:${lineNumber} (${workingDirectory})`).join(', ')}`);
  }

  const missingScripts = usages.filter(({ packageName, script }) => !packageScripts[packageName][script]);
  if (missingScripts.length > 0) {
    throw new Error(`workflow references missing package scripts: ${missingScripts.map(({ workflowPath, lineNumber, packageName, script }) => `${relative(workflowPath)}:${lineNumber} ${packageName}:${script}`).join(', ')}`);
  }

  [
    'root:test',
    'root:deps:check',
    'root:db:backup:check',
    'root:ops:preflight',
    'root:db:migrate:status',
    'root:db:migrate',
    'root:db:rollback',
    'root:test:e2e',
    'root:test:e2e:browser',
    'frontend:lint',
    'frontend:build'
  ].forEach((expectedUsage) => {
    const packageName = expectedUsage.slice(0, expectedUsage.indexOf(':'));
    const expectedScript = expectedUsage.slice(packageName.length + 1);
    if (!usages.some((usage) => usage.packageName === packageName && usage.script === expectedScript)) {
      throw new Error(`workflows must keep the ${expectedUsage} package script gate.`);
    }
  });

  console.log('ok workflow package script references');
};

const verifyWorkflowLocalPathReferences = () => {
  const workflowPaths = walk(path.join(rootDir, '.github/workflows'), (filePath) => /\.(?:ya?ml)$/.test(filePath)).sort();
  const missingReferences = [];

  const checkPath = (workflowPath, lineNumber, rawPath) => {
    const localPath = rawPath
      .replace(/^['"]|['"]$/g, '')
      .replace(/\\$/, '')
      .replace(/:.+$/, '');

    if (!localPath || localPath === '.' || localPath.startsWith('/')) return;
    if (!/^[A-Za-z0-9._/-]+$/.test(localPath)) return;
    if (!fs.existsSync(path.join(rootDir, localPath.replace(/^\.\//, '')))) {
      missingReferences.push(`${relative(workflowPath)}:${lineNumber} ${localPath}`);
    }
  };

  workflowPaths.forEach((workflowPath) => {
    const source = fs.readFileSync(workflowPath, 'utf8');
    const lines = source.split(/\r?\n/);
    let activeCacheDependencyPath = null;
    let activeDockerBuild = false;

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const trimmed = line.trim();
      const indent = line.match(/^\s*/)[0].length;

      if (activeCacheDependencyPath && trimmed && indent <= activeCacheDependencyPath.indent) {
        activeCacheDependencyPath = null;
      }
      if (activeCacheDependencyPath && trimmed) {
        checkPath(workflowPath, lineNumber, trimmed);
      }

      const cacheDependencyPathMatch = line.match(/^(\s*)cache-dependency-path:\s*(.*)$/);
      if (cacheDependencyPathMatch) {
        const value = cacheDependencyPathMatch[2].trim();
        if (value === '|') {
          activeCacheDependencyPath = { indent: cacheDependencyPathMatch[1].length };
        } else {
          checkPath(workflowPath, lineNumber, value);
        }
      }

      const contextMatch = line.match(/^\s*context:\s*(\.\.?\/?[A-Za-z0-9._/-]*|\.)\s*$/);
      if (contextMatch) {
        checkPath(workflowPath, lineNumber, contextMatch[1]);
      }

      Array.from(line.matchAll(/\$\{\{\s*github\.workspace\s*\}\}\/([A-Za-z0-9._/-]+)/g), (match) => match[1])
        .forEach((localPath) => checkPath(workflowPath, lineNumber, localPath));

      Array.from(line.matchAll(/path\.join\(process\.cwd\(\),\s*'([^']+)'\)/g), (match) => match[1])
        .forEach((localPath) => checkPath(workflowPath, lineNumber, localPath));

      const copyMatch = trimmed.match(/^cp\s+([A-Za-z0-9._/-]+)\s+/);
      if (copyMatch) {
        checkPath(workflowPath, lineNumber, copyMatch[1]);
      }

      if (/\bdocker\s+build\b/.test(line)) {
        activeDockerBuild = true;
      }
      if (activeDockerBuild) {
        trimmed.split(/\s+/)
          .map((token) => token.replace(/\\$/, ''))
          .filter((token) => token === '.' || token.startsWith('./'))
          .forEach((localPath) => checkPath(workflowPath, lineNumber, localPath));
        if (!/\\$/.test(trimmed)) {
          activeDockerBuild = false;
        }
      }
    });
  });

  if (missingReferences.length > 0) {
    throw new Error(`workflow local path references must point to existing files or directories: ${missingReferences.join(', ')}`);
  }

  console.log('ok workflow local path references');
};

const verifyWorkflowReleaseGuards = () => {
  const releasePath = path.join(rootDir, '.github/workflows/release.yml');
  const deployPath = path.join(rootDir, '.github/workflows/deploy-compose.yml');
  const ciPath = path.join(rootDir, '.github/workflows/ci.yml');
  const releaseSource = fs.readFileSync(releasePath, 'utf8');
  const deploySource = fs.readFileSync(deployPath, 'utf8');
  const ciSource = fs.readFileSync(ciPath, 'utf8');
  const githubActionsAuditSource = fs.readFileSync(path.join(rootDir, 'scripts/github-actions-secrets-audit.sh'), 'utf8');
  const githubEnvironmentAuditSource = fs.readFileSync(path.join(rootDir, 'scripts/github-environment-audit.sh'), 'utf8');

  if (/VITE_API_URL=\$\{\{\s*vars\.FRONTEND_API_URL\s*\|\|/.test(releaseSource)) {
    throw new Error('release.yml must not fall back to localhost when FRONTEND_API_URL is missing.');
  }
  if (/image_tag:[\s\S]*?default:\s*manual/.test(releaseSource)) {
    throw new Error('release.yml must not default manual releases to a reusable mutable image tag.');
  }
  if (!/image_tag must be an immutable release tag, not latest or manual/.test(releaseSource)) {
    throw new Error('release.yml must reject mutable manual release image tags before publishing.');
  }
  if (!/image_tag is required for manual release image publishing/.test(releaseSource)) {
    throw new Error('release.yml must require an explicit image_tag for manual image publishing.');
  }
  if (!/FRONTEND_API_URL repository variable is required/.test(releaseSource)) {
    throw new Error('release.yml must fail before publishing when FRONTEND_API_URL is missing.');
  }
  if (!/FRONTEND_API_URL must point to the deployed backend, not a local address/.test(releaseSource)) {
    throw new Error('release.yml must reject local FRONTEND_API_URL values.');
  }
  const frontendUrlLowercaseGuard = 'frontend_api_url_lower="$(printf \'%s\' "$FRONTEND_API_URL" | tr \'[:upper:]\' \'[:lower:]\')"';
  if (
    releaseSource.split(frontendUrlLowercaseGuard).length - 1 < 2 ||
    !releaseSource.includes('if ! [[ "$frontend_api_url_lower" =~ $safe_url_pattern ]]; then') ||
    !releaseSource.includes('if [[ "$frontend_api_url_lower" =~ ^https?://(localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::1\\])(:|/|$) ]]; then') ||
    releaseSource.includes('if [[ "$FRONTEND_API_URL" =~ ^https?://(localhost')
  ) {
    throw new Error('release.yml frontend API URL guard must validate scheme and local addresses case-insensitively before publishing.');
  }
  if (
    !/FRONTEND_KIOSK_STATUS_TOKEN:\s*\$\{\{\s*vars\.FRONTEND_KIOSK_STATUS_TOKEN\s*\}\}/.test(releaseSource) ||
    !/VITE_KIOSK_STATUS_TOKEN:\s*\$\{\{\s*vars\.FRONTEND_KIOSK_STATUS_TOKEN\s*\}\}/.test(releaseSource) ||
    !/VITE_KIOSK_STATUS_TOKEN=\$\{\{\s*vars\.FRONTEND_KIOSK_STATUS_TOKEN\s*\}\}/.test(releaseSource)
  ) {
    throw new Error('release.yml must pass optional FRONTEND_KIOSK_STATUS_TOKEN through frontend validation and image build args.');
  }
  if (
    !/FRONTEND_KIOSK_STATUS_TOKEN must be at least 16 characters when set/.test(releaseSource) ||
    !/FRONTEND_KIOSK_STATUS_TOKEN must not use placeholder values/.test(releaseSource) ||
    !/FRONTEND_KIOSK_STATUS_TOKEN must not contain whitespace/.test(releaseSource) ||
    releaseSource.split('frontend_kiosk_status_token_lower="$(printf \'%s\' "$FRONTEND_KIOSK_STATUS_TOKEN" | tr \'[:upper:]\' \'[:lower:]\')"').length - 1 < 2 ||
    releaseSource.includes('[[ "$FRONTEND_KIOSK_STATUS_TOKEN" =~ ^(change_this|replace_with|your[_-]) ]]')
  ) {
    throw new Error('release.yml must reject unsafe optional frontend kiosk status tokens before publishing.');
  }
  if (/=~ \^https\?:\/\/\[A-Za-z0-9\._~:\/\?#/.test(`${releaseSource}\n${deploySource}`)) {
    throw new Error('workflow URL validation regex must be stored in a variable before using [[ value =~ pattern ]].');
  }
  if (/image_tag:[\s\S]*?default:\s*latest/.test(deploySource)) {
    throw new Error('deploy-compose.yml must not default production deploys to the latest image tag.');
  }
  if (!/image_tag must be an immutable release tag, not latest/.test(deploySource)) {
    throw new Error('deploy-compose.yml must reject latest image_tag before connecting to SSH.');
  }
  if (!/for secret_name in DEPLOY_SSH_HOST DEPLOY_SSH_USER DEPLOY_SSH_PRIVATE_KEY/.test(deploySource)) {
    throw new Error('deploy-compose.yml must validate required deploy secrets before SSH setup.');
  }
  if (!/VITE_API_URL:\s*\$\{\{\s*vars\.FRONTEND_API_URL\s*\}\}/.test(releaseSource)) {
    throw new Error('release.yml validation build must use FRONTEND_API_URL for the frontend bundle.');
  }
  if (
    !/VITE_USE_MOCK_DATA:\s*"false"/.test(releaseSource) ||
    !/VITE_USE_MOCK_DATA=false/.test(releaseSource)
  ) {
    throw new Error('release.yml frontend validation and image build must explicitly disable mock data.');
  }
  if (/\$\{\{\s*steps\.meta\.outputs\.(?:backend_image|frontend_image)\s*\}\}:latest/.test(releaseSource)) {
    throw new Error('release.yml must not publish mutable latest tags; production deploys require immutable image tags.');
  }
  if (!/--build-arg VITE_ALLOW_LOCAL_API_URL=true/.test(ciSource)) {
    throw new Error('ci.yml Docker smoke build must explicitly mark localhost frontend API URLs as CI-only.');
  }
  if (
    !/VITE_API_URL:\s*http:\/\/localhost:3000/.test(ciSource) ||
    !/VITE_ALLOW_LOCAL_API_URL:\s*"true"/.test(ciSource) ||
    !/VITE_USE_MOCK_DATA:\s*"false"/.test(ciSource)
  ) {
    throw new Error('ci.yml frontend build must explicitly set local API and mock-mode guard env.');
  }
  if (
    !/check config \/etc\/prometheus\/prometheus\.yml/.test(ciSource) ||
    !/ci-metrics-token-at-least-32-characters/.test(ciSource) ||
    !/chmod 755 "\$temp_secret_dir"/.test(ciSource) ||
    !/chmod 644 "\$temp_secret_dir\/metrics_token"/.test(ciSource) ||
    !/\/run\/secrets:ro/.test(ciSource) ||
    !/check config \/etc\/prometheus\/prometheus\.secure\.yml/.test(ciSource)
  ) {
    throw new Error('ci.yml must validate both open and token-secured Prometheus configs.');
  }
  if (!/PREFLIGHT_VALIDATE_MONITORING:\s*"1"/.test(releaseSource)) {
    throw new Error('release.yml production preflight must run Docker monitoring config validation before publishing images.');
  }
  [ciSource, releaseSource].forEach((workflowSource, index) => {
    if (
      !/Run production preflight structure check/.test(workflowSource) ||
      !/temp_dir="\$\(mktemp -d\)"/.test(workflowSource) ||
      !/AIOSK_SECRETS_DIR=\$temp_dir\/secrets/.test(workflowSource) ||
      !/METRICS_TOKEN_FILE=\/run\/secrets\/metrics_token/.test(workflowSource) ||
      !/PREFLIGHT_ENV_FILE="\$temp_dir\/env\.production" npm run ops:preflight/.test(workflowSource)
    ) {
      throw new Error(`workflow ${index + 1} preflight structure check must exercise file-backed metrics tokens.`);
    }
    if (/PREFLIGHT_ENV_FILE:\s*\.env\.production\.example/.test(workflowSource)) {
      throw new Error(`workflow ${index + 1} preflight structure check must not run directly against .env.production.example without a metrics token fixture.`);
    }
  });
  if (!/gh api "\$path" --jq "\$jq_filter"/.test(githubActionsAuditSource)) {
    throw new Error('GitHub Actions secrets audit must use gh api --jq for API field extraction.');
  }
  if (!/gh_api_or_fail\(\)/.test(githubEnvironmentAuditSource) || !/gh api "\$path" --jq "\$jq_filter"/.test(githubEnvironmentAuditSource)) {
    throw new Error('GitHub Environment audit must use gh api --jq for API field extraction.');
  }
  if (!/RECOMMENDED_VARIABLES="\$\{GITHUB_RECOMMENDED_ACTION_VARIABLES-FRONTEND_KIOSK_STATUS_TOKEN\}"/.test(githubActionsAuditSource) || !/audit_recommended_names "repository variable" "\$RECOMMENDED_VARIABLES" "\$repo_variables" ""/.test(githubActionsAuditSource)) {
    throw new Error('GitHub Actions secrets audit must warn when optional FRONTEND_KIOSK_STATUS_TOKEN is missing.');
  }
  if (/command -v jq|jq is required|administration access and jq|\bjq\s+-/.test(`${githubActionsAuditSource}\n${githubEnvironmentAuditSource}`)) {
    throw new Error('GitHub audit scripts must not require a local jq binary; use gh api --jq instead.');
  }
  if (
    !/validate_name_csv\(\)/.test(githubActionsAuditSource) ||
    !/if \[ -z "\$\(printf '%s' "\$names_csv" \| sed 's\/\^\[\[:space:\]\]\*\/\/; s\/\[\[:space:\]\]\*\$\/\/'\)" \]; then/.test(githubActionsAuditSource) ||
    !/fail "\$env_name must contain at least one \$label name\."/.test(githubActionsAuditSource) ||
    !/fail "\$env_name must not contain empty entries\."/.test(githubActionsAuditSource) ||
    !/fail "\$env_name contains invalid \$label name: \$name\."/.test(githubActionsAuditSource) ||
    !/validate_name_csv GITHUB_REQUIRED_ACTION_SECRETS secret "\$REQUIRED_SECRETS" 1/.test(githubActionsAuditSource) ||
    !/validate_name_csv GITHUB_REQUIRED_ACTION_VARIABLES "repository variable" "\$REQUIRED_VARIABLES" 1/.test(githubActionsAuditSource)
  ) {
    throw new Error('GitHub Actions secrets audit must validate custom secret/variable name CSVs before calling GitHub.');
  }
  [
    ['scripts/github-actions-secrets-audit.sh', githubActionsAuditSource],
    ['scripts/github-environment-audit.sh', githubEnvironmentAuditSource]
  ].forEach(([file, source]) => {
    if (!/if \[ "\$#" -ne 0 \]; then\s+echo "Usage: \$0" >&2\s+exit 1\s+fi/.test(source)) {
      throw new Error(`${file} must reject unexpected positional arguments before GitHub API checks.`);
    }
  });
  [
    'scripts/github-actions-secrets-audit.sh',
    'scripts/github-environment-audit.sh'
  ].forEach((file) => {
    const result = spawnSync('bash', [file, 'unexpected'], {
      cwd: rootDir,
      env: {
        ...process.env,
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_ENVIRONMENT: 'production'
      },
      encoding: 'utf8'
    });

    if (
      result.status === 0 ||
      !`${result.stdout}\n${result.stderr}`.includes('Usage:') ||
      /gh CLI|GitHub API/.test(`${result.stdout}\n${result.stderr}`)
    ) {
      throw new Error(`${file} should reject unexpected positional arguments before GitHub API checks:\n${result.stdout}\n${result.stderr}`);
    }
  });
  [
    ['GITHUB_REQUIRED_ACTION_SECRETS', '', 'GITHUB_REQUIRED_ACTION_SECRETS must contain at least one secret name.'],
    ['GITHUB_REQUIRED_ACTION_SECRETS', ',', 'GITHUB_REQUIRED_ACTION_SECRETS must not contain empty entries.'],
    ['GITHUB_REQUIRED_ACTION_VARIABLES', 'FRONTEND_API_URL,bad-name', 'GITHUB_REQUIRED_ACTION_VARIABLES contains invalid repository variable name: bad-name.'],
    ['GITHUB_RECOMMENDED_ACTION_SECRETS', 'DEPLOY_KNOWN_HOSTS,bad-name', 'GITHUB_RECOMMENDED_ACTION_SECRETS contains invalid secret name: bad-name.']
  ].forEach(([envName, value, expectedMessage]) => {
    const result = spawnSync('bash', ['scripts/github-actions-secrets-audit.sh'], {
      cwd: rootDir,
      env: {
        ...process.env,
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_ENVIRONMENT: 'production',
        GITHUB_REQUIRED_ACTION_SECRETS: 'DEPLOY_SSH_HOST',
        GITHUB_RECOMMENDED_ACTION_SECRETS: 'DEPLOY_KNOWN_HOSTS',
        GITHUB_REQUIRED_ACTION_VARIABLES: 'FRONTEND_API_URL',
        GITHUB_RECOMMENDED_ACTION_VARIABLES: 'FRONTEND_KIOSK_STATUS_TOKEN',
        [envName]: value
      },
      encoding: 'utf8'
    });

    if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes(expectedMessage)) {
      throw new Error(`GitHub Actions secrets audit should reject invalid ${envName}=${value} before calling GitHub:\n${result.stdout}\n${result.stderr}`);
    }
  });
  const emptyRecommendedResult = spawnSync('bash', ['scripts/github-actions-secrets-audit.sh'], {
    cwd: rootDir,
    env: {
      ...process.env,
      GITHUB_REPOSITORY: 'bad',
      GITHUB_ENVIRONMENT: 'production',
      GITHUB_REQUIRED_ACTION_SECRETS: 'DEPLOY_SSH_HOST',
      GITHUB_RECOMMENDED_ACTION_SECRETS: '',
      GITHUB_REQUIRED_ACTION_VARIABLES: 'FRONTEND_API_URL',
      GITHUB_RECOMMENDED_ACTION_VARIABLES: ''
    },
    encoding: 'utf8'
  });
  if (
    emptyRecommendedResult.status === 0 ||
    !`${emptyRecommendedResult.stdout}\n${emptyRecommendedResult.stderr}`.includes('GITHUB_REPOSITORY must be in owner/repo form.') ||
    /GITHUB_RECOMMENDED_ACTION_(?:SECRETS|VARIABLES)/.test(`${emptyRecommendedResult.stdout}\n${emptyRecommendedResult.stderr}`)
  ) {
    throw new Error(`GitHub Actions secrets audit should allow empty recommended override lists before GitHub API checks:\n${emptyRecommendedResult.stdout}\n${emptyRecommendedResult.stderr}`);
  }
  console.log('ok workflow release guards');
};

const verifyFrontendApiUrlGuards = () => {
  const apiSource = fs.readFileSync(path.join(rootDir, 'frontend/src/services/api.ts'), 'utf8');
  const mockDataSource = fs.readFileSync(path.join(rootDir, 'frontend/src/data/mockData.ts'), 'utf8');
  const dockerfileSource = fs.readFileSync(path.join(rootDir, 'frontend/Dockerfile'), 'utf8');
  const dockerComposeSource = fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8');
  const frontendEnvExampleSource = fs.readFileSync(path.join(rootDir, 'frontend/.env.example'), 'utf8');
  const frontendPackage = JSON.parse(fs.readFileSync(path.join(rootDir, 'frontend/package.json'), 'utf8'));
  const frontendPackageLock = JSON.parse(fs.readFileSync(path.join(rootDir, 'frontend/package-lock.json'), 'utf8'));
  const frontendBuildEnvValidator = fs.readFileSync(path.join(rootDir, 'frontend/scripts/validate-build-env.js'), 'utf8');
  const frontendBuildEnvDocs = [
    ['README.md', fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8')],
    ['frontend/README.md', fs.readFileSync(path.join(rootDir, 'frontend/README.md'), 'utf8')],
    ['OPERATIONS_RUNBOOK.md', fs.readFileSync(path.join(rootDir, 'OPERATIONS_RUNBOOK.md'), 'utf8')],
    ['FRONTEND_TEST_REPORT.md', fs.readFileSync(path.join(rootDir, 'FRONTEND_TEST_REPORT.md'), 'utf8')],
    ['PROJECT_COMPLETENESS_AUDIT.md', fs.readFileSync(path.join(rootDir, 'PROJECT_COMPLETENESS_AUDIT.md'), 'utf8')]
  ];

  if (/VITE_API_URL\s*\|\|\s*['"]http:\/\/localhost:3000['"]/.test(apiSource)) {
    throw new Error('frontend API client must not fall back to localhost in production bundles.');
  }
  if (!/import\.meta\.env\.DEV/.test(apiSource) || !/VITE_ALLOW_LOCAL_API_URL/.test(apiSource)) {
    throw new Error('frontend API client must keep localhost defaults scoped to dev or explicit local verification builds.');
  }
  if (/const isLocalApiUrl\s*=|isLocalApiUrl\(/.test(`${apiSource}\n${frontendBuildEnvValidator}`) || !/import\.meta\.env\.PROD && !allowLocalApiUrl && \/\^https\?:\\\/\\\/\(\?:localhost\|127\\\.0\\\.0\\\.1\|0\\\.0\\\.0\\\.0\|\\\[::1\\\]\)\(\?:\:\|\\\/\|\$\)\/i\.test\(configuredUrl\)/.test(apiSource) || !/!allowLocalApiUrl && \/\^https\?:\\\/\\\/\(\?:localhost\|127\\\.0\\\.0\\\.1\|0\\\.0\\\.0\\\.0\|\\\[::1\\\]\)\(\?:\:\|\\\/\|\$\)\/i\.test\(apiUrl\)/.test(frontendBuildEnvValidator)) {
    throw new Error('frontend API URL guards must inline the single-use local URL predicate in runtime and build-time production guards.');
  }
  if (/const resolveApiBaseUrl\s*=|resolveApiBaseUrl\(/.test(apiSource) || !/const configuredUrl = import\.meta\.env\.VITE_API_URL\?\.trim\(\);[\s\S]*if \(!configuredUrl && !import\.meta\.env\.DEV\) \{[\s\S]*VITE_API_URL must be set for production frontend builds[\s\S]*const API_BASE_URL = configuredUrl \|\| LOCAL_API_BASE_URL;/.test(apiSource)) {
    throw new Error('frontend API client must not keep a single-use resolveApiBaseUrl helper; API URL guard and dev fallback stay at module initialization.');
  }
  if (/export default apiClient/.test(apiSource)) {
    throw new Error('frontend API client must not keep an unused default export; use the named apiClient export.');
  }
  if (
    /type AxiosResponse|response:\s*AxiosResponse|return response;/.test(apiSource) ||
    !/apiClient\.interceptors\.response\.use\(\s*undefined,\s*\(error\) => \{/.test(apiSource)
  ) {
    throw new Error('frontend API client must not keep a no-op success response interceptor; only the error interceptor changes behavior.');
  }
  if (
    frontendPackage.name !== 'aiosk-frontend' ||
    frontendPackage.version !== '1.0.0' ||
    frontendPackage.description !== 'AIOSK kiosk ordering frontend for the All-In-One Smart Kiosk system' ||
    frontendPackageLock.name !== frontendPackage.name ||
    frontendPackageLock.version !== frontendPackage.version ||
    frontendPackageLock.packages?.['']?.name !== frontendPackage.name ||
    frontendPackageLock.packages?.['']?.version !== frontendPackage.version
  ) {
    throw new Error('frontend package metadata and lockfile root must use AIOSK frontend product metadata instead of Vite scaffold defaults.');
  }
  if (/ARG VITE_API_URL=/.test(dockerfileSource)) {
    throw new Error('frontend Dockerfile must require an explicit VITE_API_URL build argument.');
  }
  if (!/VITE_API_URL is required for frontend image builds/.test(dockerfileSource)) {
    throw new Error('frontend Dockerfile must fail when VITE_API_URL is missing.');
  }
  if (!/VITE_API_URL must not point to a local address for frontend image builds/.test(dockerfileSource)) {
    throw new Error('frontend Dockerfile must reject localhost API URLs unless explicitly allowed.');
  }
  if (
    !/vite_api_url_lower="\$\(printf '%s' "\$VITE_API_URL" \| tr '\[:upper:\]' '\[:lower:\]'\)";/.test(dockerfileSource) ||
    !/case "\$vite_api_url_lower" in/.test(dockerfileSource)
  ) {
    throw new Error('frontend Dockerfile local API URL guard must normalize scheme and host case before matching.');
  }
  if (
    /localhost\*/.test(dockerfileSource) ||
    !/http:\/\/localhost\|https:\/\/localhost\|http:\/\/localhost\[:\/\]\*\|https:\/\/localhost\[:\/\]\*/.test(dockerfileSource) ||
    !/http:\/\/\\\[::1\\\]\|https:\/\/\\\[::1\\\]\|http:\/\/\\\[::1\\\]\[:\/\]\*\|https:\/\/\\\[::1\\\]\[:\/\]\*/.test(dockerfileSource)
  ) {
    throw new Error('frontend Dockerfile local API URL guard must match validator boundaries for localhost and [::1].');
  }
  if (!/VITE_USE_MOCK_DATA must be false for frontend image builds/.test(dockerfileSource)) {
    throw new Error('frontend Dockerfile must reject mock data production image builds.');
  }
  if (
    !/VITE_ALLOW_LOCAL_API_URL must be true or false for frontend image builds/.test(dockerfileSource) ||
    !/VITE_USE_MOCK_DATA must be true or false for frontend image builds/.test(dockerfileSource)
  ) {
    throw new Error('frontend Dockerfile must reject invalid frontend boolean build args before image builds.');
  }
  if (!/ARG VITE_KIOSK_STATUS_TOKEN/.test(dockerfileSource) || !/ENV VITE_KIOSK_STATUS_TOKEN=\$VITE_KIOSK_STATUS_TOKEN/.test(dockerfileSource)) {
    throw new Error('frontend Dockerfile must expose optional VITE_KIOSK_STATUS_TOKEN to production builds.');
  }
  if (!/VITE_ALLOW_LOCAL_API_URL:\s*\$\{VITE_ALLOW_LOCAL_API_URL:-true\}/.test(dockerComposeSource)) {
    throw new Error('local docker-compose.yml must explicitly mark localhost frontend API URLs as local-only.');
  }
  if (!/VITE_KIOSK_STATUS_TOKEN:\s*\$\{FRONTEND_KIOSK_STATUS_TOKEN:-\}/.test(dockerComposeSource)) {
    throw new Error('local docker-compose.yml must pass optional frontend kiosk status token to the frontend build.');
  }
  if (frontendPackage.scripts?.prebuild !== 'node scripts/validate-build-env.js') {
    throw new Error('frontend package must validate production build environment before vite build.');
  }
  if (frontendPackage.scripts?.build !== 'tsc -b && vite build') {
    throw new Error('frontend package build must run TypeScript before Vite so noUnused* prune gates execute.');
  }
  if (frontendPackage.scripts?.preview) {
    throw new Error('frontend package must not keep an unused Vite preview scaffold script; local verification uses lint/build and production image checks use Docker/Nginx.');
  }
  if (!/VITE_KIOSK_STATUS_TOKEN=/.test(frontendEnvExampleSource)) {
    throw new Error('frontend .env.example must document optional VITE_KIOSK_STATUS_TOKEN.');
  }
  if (!/VITE_API_URL is required for production frontend builds/.test(frontendBuildEnvValidator)) {
    throw new Error('frontend build env validator must require VITE_API_URL.');
  }
  if (!/VITE_API_URL must not point to a local address for production frontend builds/.test(frontendBuildEnvValidator)) {
    throw new Error('frontend build env validator must reject local API URLs unless explicitly allowed.');
  }
  if (
    /const loadViteEnv\s*=|loadViteEnv\(/.test(frontendBuildEnvValidator) ||
    !/const envFiles = \['\.env', '\.env\.local', '\.env\.production', '\.env\.production\.local'\];[\s\S]*const fileEnv = envFiles\.reduce\(\(values, fileName\) => \(\{[\s\S]*\.\.\.parseEnvFile\(path\.join\(rootDir, fileName\)\)[\s\S]*const env = \{[\s\S]*\.\.\.fileEnv,[\s\S]*\.\.\.process\.env/.test(frontendBuildEnvValidator)
  ) {
    throw new Error('frontend build env validator must inline env file merging without a single-use loadViteEnv helper.');
  }
  if (
    !/const envLine = trimmed\.startsWith\('export '\) \? trimmed\.slice\('export '\.length\)\.trimStart\(\) : trimmed;/.test(frontendBuildEnvValidator) ||
    !/\/\^\[A-Za-z_\]\[A-Za-z0-9_\]\*=\/\.test\(envLine\)/.test(frontendBuildEnvValidator) ||
    !/fail\(`malformed env line \$\{lineNumber\} in \$\{filePath\}`\)/.test(frontendBuildEnvValidator)
  ) {
    throw new Error('frontend build env validator must reject malformed env file lines with a line-number-only failure.');
  }
  const docsMissingFrontendEnvParser = frontendBuildEnvDocs
    .filter(([, source]) => !/Frontend build env files are parsed as strict key\/value data/.test(source))
    .map(([docPath]) => docPath);
  if (docsMissingFrontendEnvParser.length > 0) {
    throw new Error(`Docs must describe strict frontend build env file parsing: ${docsMissingFrontendEnvParser.join(', ')}`);
  }
  if (!/VITE_USE_MOCK_DATA must be false for production frontend builds/.test(frontendBuildEnvValidator)) {
    throw new Error('frontend build env validator must reject mock data production builds.');
  }
  if (
    !/\['VITE_ALLOW_LOCAL_API_URL', 'VITE_USE_MOCK_DATA'\]\.forEach\(\(envName\) => \{[\s\S]*!\['true', 'false'\]\.includes\(value\)[\s\S]*`\$\{envName\} must be true or false for production frontend builds\.`/.test(frontendBuildEnvValidator)
  ) {
    throw new Error('frontend build env validator must reject invalid frontend boolean flags.');
  }
  if (
    !/VITE_KIOSK_STATUS_TOKEN must be at least 16 characters when set/.test(frontendBuildEnvValidator) ||
    !/VITE_KIOSK_STATUS_TOKEN must not use placeholder values/.test(frontendBuildEnvValidator) ||
    !/VITE_KIOSK_STATUS_TOKEN must not contain whitespace/.test(frontendBuildEnvValidator) ||
    !/\/\^\(change_this\|replace_with\|your\[_-\]\)\/i\.test\(kioskStatusToken\)/.test(frontendBuildEnvValidator)
  ) {
    throw new Error('frontend build env validator must reject unsafe optional kiosk status token values.');
  }
  const tempFrontendRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-frontend-env-'));
  try {
    fs.mkdirSync(path.join(tempFrontendRoot, 'scripts'));
    fs.writeFileSync(path.join(tempFrontendRoot, 'package.json'), JSON.stringify({ type: 'module' }));
    fs.writeFileSync(path.join(tempFrontendRoot, 'scripts/validate-build-env.js'), frontendBuildEnvValidator);
    const malformedEnvPath = path.join(tempFrontendRoot, '.env.production.local');
    fs.writeFileSync(malformedEnvPath, [
      'VITE_API_URL=https://api.example.com',
      'NOT A VALID ENV LINE'
    ].join('\n'));
    const malformedEnvResult = spawnSync(process.execPath, ['scripts/validate-build-env.js'], {
      cwd: tempFrontendRoot,
      env: {
        HOME: process.env.HOME || '',
        PATH: process.env.PATH || ''
      },
      encoding: 'utf8'
    });
    const malformedEnvOutput = `${malformedEnvResult.stdout}\n${malformedEnvResult.stderr}`;
    if (
      malformedEnvResult.status === 0 ||
      !malformedEnvOutput.includes(`malformed env line 2 in ${malformedEnvPath}`)
    ) {
      throw new Error(`frontend build env validator should reject malformed env file lines:\n${malformedEnvOutput}`);
    }
    if (
      malformedEnvOutput.includes('NOT A VALID ENV LINE') ||
      malformedEnvOutput.includes('VITE_API_URL is required')
    ) {
      throw new Error(`frontend build env validator malformed env failure should not echo env content or continue validation:\n${malformedEnvOutput}`);
    }
  } finally {
    fs.rmSync(tempFrontendRoot, { recursive: true, force: true });
  }
  [
    ['VITE_ALLOW_LOCAL_API_URL', '1'],
    ['VITE_USE_MOCK_DATA', 'yes']
  ].forEach(([envName, value]) => {
    const result = spawnSync(process.execPath, ['scripts/validate-build-env.js'], {
      cwd: path.join(rootDir, 'frontend'),
      env: {
        ...process.env,
        VITE_API_URL: 'https://api.example.com',
        VITE_ALLOW_LOCAL_API_URL: 'false',
        VITE_USE_MOCK_DATA: 'false',
        [envName]: value
      },
      encoding: 'utf8'
    });

    if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes(`${envName} must be true or false for production frontend builds.`)) {
      throw new Error(`frontend build env validator should reject invalid ${envName}=${value}:\n${result.stdout}\n${result.stderr}`);
    }
  });
  const uppercaseLocalApiUrlResult = spawnSync(process.execPath, ['scripts/validate-build-env.js'], {
    cwd: path.join(rootDir, 'frontend'),
    env: {
      ...process.env,
      VITE_API_URL: 'HTTP://LOCALHOST:3000',
      VITE_ALLOW_LOCAL_API_URL: 'false',
      VITE_USE_MOCK_DATA: 'false',
      VITE_KIOSK_STATUS_TOKEN: ''
    },
    encoding: 'utf8'
  });
  if (uppercaseLocalApiUrlResult.status === 0 || !`${uppercaseLocalApiUrlResult.stdout}\n${uppercaseLocalApiUrlResult.stderr}`.includes('VITE_API_URL must not point to a local address for production frontend builds.')) {
    throw new Error(`frontend build env validator should reject uppercase local VITE_API_URL values:\n${uppercaseLocalApiUrlResult.stdout}\n${uppercaseLocalApiUrlResult.stderr}`);
  }
  const uppercasePlaceholderTokenResult = spawnSync(process.execPath, ['scripts/validate-build-env.js'], {
    cwd: path.join(rootDir, 'frontend'),
    env: {
      ...process.env,
      VITE_API_URL: 'https://api.example.com',
      VITE_ALLOW_LOCAL_API_URL: 'false',
      VITE_USE_MOCK_DATA: 'false',
      VITE_KIOSK_STATUS_TOKEN: 'Change_This_Kiosk_Status_Token'
    },
    encoding: 'utf8'
  });
  if (uppercasePlaceholderTokenResult.status === 0 || !`${uppercasePlaceholderTokenResult.stdout}\n${uppercasePlaceholderTokenResult.stderr}`.includes('VITE_KIOSK_STATUS_TOKEN must not use placeholder values.')) {
    throw new Error(`frontend build env validator should reject uppercase placeholder VITE_KIOSK_STATUS_TOKEN values:\n${uppercasePlaceholderTokenResult.stdout}\n${uppercasePlaceholderTokenResult.stderr}`);
  }
  if (!/import\.meta\.env\.PROD/.test(mockDataSource) || !/VITE_USE_MOCK_DATA must be false in production frontend bundles/.test(mockDataSource)) {
    throw new Error('frontend mock data path must reject production bundles.');
  }

  console.log('ok frontend API URL guards');
};

const verifyHtmlInjectionGuards = () => {
  const printUtilsSource = fs.readFileSync(path.join(rootDir, 'frontend/src/utils/printUtils.ts'), 'utf8');
  const adminJsSource = fs.readFileSync(path.join(rootDir, 'public/js/admin.js'), 'utf8');
  const adminOrdersSource = fs.readFileSync(path.join(rootDir, 'src/views/admin/orders.ejs'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');

  if (!/const escapeHtml = \(value: unknown\): string =>/.test(printUtilsSource)) {
    throw new Error('printUtils.ts must HTML-escape values before writing receipt markup.');
  }
  if (/\$\{item\.menuName \|\| `메뉴 \$\{item\.menuId\}`\}/.test(printUtilsSource)) {
    throw new Error('printUtils.ts must not interpolate raw menu names into document.write markup.');
  }
  if (!/const itemName = escapeHtml\(item\.menuName\);/.test(printUtilsSource)) {
    throw new Error('printUtils.ts must escape receipt menu names.');
  }
  if (!/function escapeHtml\(value\)/.test(adminJsSource)) {
    throw new Error('admin.js must provide HTML escaping for dynamic inserted markup.');
  }
  if (/\$\{notification\.message\}/.test(adminJsSource) || /\$\{message\}/.test(adminJsSource)) {
    throw new Error('admin.js must not interpolate raw alert or notification messages into HTML strings.');
  }
  if (/addNotificationToList\(\{\s*id:|type:\s*'order'/.test(adminJsSource)) {
    throw new Error('admin.js notification list payload must not carry unused id/type fields.');
  }
  if (!/allowedTypes = \['success', 'danger', 'warning', 'info'\]/.test(adminJsSource)) {
    throw new Error('admin.js must restrict Bootstrap alert type interpolation.');
  }
  if (!/const showAlert = \(message, type\) => \{/.test(adminJsSource) || /function showAlert\(/.test(adminJsSource)) {
    throw new Error('admin.js showAlert must stay a file-local lexical helper, not a browser global function.');
  }
  if (/showAlert:\s*function\(message,\s*type\s*=\s*['"]info['"]\)|const\s+AdminUtils\s*=\s*\{|AdminUtils\.(?:showSuccess|showError|showWarning|showAlert)/.test(adminJsSource)) {
    throw new Error('admin.js must not keep AdminUtils wrappers or duplicate the info default already provided by the alert type allowlist.');
  }
  if (
    !/container\.insertAdjacentHTML\('afterbegin', alertHtml\);\s*const alert = container\.querySelector\('\.alert'\);[\s\S]*if \(!alert\.isConnected\) return;[\s\S]*const bsAlert = bootstrap\.Alert\.getOrCreateInstance\(alert\);/.test(adminJsSource) ||
    /new bootstrap\.Alert\(alert\)/.test(adminJsSource)
  ) {
    throw new Error('admin.js showAlert auto-dismiss must ignore alerts already closed by the user and reuse Bootstrap alert instances.');
  }
  if (/\$\{item\.menuName\}/.test(adminOrdersSource)) {
    throw new Error('admin orders modal must not interpolate raw menu names into innerHTML.');
  }
  if (/item\.menuName \|\| `메뉴 \$\{item\.menuId\}`/.test(adminOrdersSource)) {
    throw new Error('admin orders modal must not depend on the unused web admin item.menuId fallback.');
  }
  if (!/const itemName = escapeHtml\(item\.menuName\);/.test(adminOrdersSource)) {
    throw new Error('admin orders modal must escape dynamic menu names before innerHTML insertion.');
  }
  if (/Number\(item\.(?:quantity|price)\)|Number\(orderDetail\.totalPrice\)/.test(adminOrdersSource)) {
    throw new Error('admin orders modal must not re-coerce numeric fields already produced by formatOrder().');
  }
  if (
    !/const quantity = item\.quantity\.toLocaleString\(\);/.test(adminOrdersSource) ||
    !/const price = item\.price\.toLocaleString\(\);/.test(adminOrdersSource) ||
    !/\$\{orderDetail\.totalPrice\.toLocaleString\(\)\}원/.test(adminOrdersSource)
  ) {
    throw new Error('admin orders modal must format numeric order detail fields directly from the view-model.');
  }
  if (/XSS 방지\*\*: 입력 데이터 검증/.test(readmeSource) || !/XSS 방지\*\*: 동적 HTML 삽입 경로 escape 및 EJS 출력 escape/.test(readmeSource)) {
    throw new Error('README.md must describe the actual XSS controls without overclaiming broad input validation.');
  }

  console.log('ok HTML injection guards');
};

const verifyCsvExportGuards = () => {
  const statisticsControllerSource = fs.readFileSync(
    path.join(rootDir, 'src/controllers/admin/statistics.controller.js'),
    'utf8'
  );
  const generateSalesReportBlock = (statisticsControllerSource.match(/const generateSalesReport = async \(req, res\) => \{[\s\S]*?\n\};\n\nconst CSV_FORMULA_PREFIX_PATTERN/) || [''])[0];

  if (!/CSV_FORMULA_PREFIX_PATTERN = \/\^\[=\+\\-@\\t\\r\]\//.test(statisticsControllerSource)) {
    throw new Error('statistics CSV export must guard spreadsheet formula prefixes.');
  }
  if (!/const escapeCsvValue = \(value\) =>/.test(statisticsControllerSource) || !/const csvRow = \(values\) =>/.test(statisticsControllerSource)) {
    throw new Error('statistics CSV export must use centralized CSV escaping helpers.');
  }
  if (/\$\{index \+ 1\},\$\{menu\.menu_name\}/.test(statisticsControllerSource) || /\$\{category\.category_name\},/.test(statisticsControllerSource)) {
    throw new Error('statistics CSV export must not interpolate raw menu or category names into CSV rows.');
  }
  if (!/csv \+= csvRow\(\[\s*index \+ 1,\s*menu\.menu_name,\s*menu\.category_name \|\| '미분류'/s.test(statisticsControllerSource)) {
    throw new Error('statistics CSV export must route top menu rows through csvRow.');
  }
  if (/category\.(?:order_count|total_quantity|category_revenue)\s*\|\|\s*0/.test(statisticsControllerSource)) {
    throw new Error('statistics CSV export must not fallback category aggregates that Statistics.getCategorySales() returns as non-null numbers.');
  }
  if (
    /const dashboardStats = await Statistics\.getDashboardStats\(startDate, endDate\);[\s\S]*if \(format === 'csv'\)/.test(generateSalesReportBlock) ||
    !/if \(format === 'csv'\) \{[\s\S]*const \[overview, topSellingMenus, categoryStats\] = await Promise\.all\(\[\s*Statistics\.getSalesStatistics\(startDate, endDate\),\s*Statistics\.getTopSellingMenus\(5, startDate, endDate\),\s*Statistics\.getCategorySales\(startDate, endDate\)\s*\]\);[\s\S]*const csvData = generateCSVReport\(\{\s*overview,\s*topSellingMenus,\s*categoryStats\s*\}\);/.test(generateSalesReportBlock) ||
    !/\} else \{[\s\S]*const dashboardStats = await Statistics\.getDashboardStats\(startDate, endDate\);[\s\S]*report:\s*dashboardStats/.test(generateSalesReportBlock)
  ) {
    throw new Error('statistics CSV report must fetch only the aggregates used by generateCSVReport while JSON reports keep the full dashboard aggregate.');
  }

  console.log('ok CSV export guards');
};

const verifyLoggerRedaction = () => {
  const script = `
const logger = require('./src/utils/logger');
if ('serializeErrorForLog' in logger) throw new Error('serializeErrorForLog must stay private to logger.js');
if (typeof logger.redactSensitiveData !== 'function') throw new Error('redactSensitiveData must stay exported for logging middleware security logs');

const redactedUrl = logger.redactUrl('/metrics?token=query-token&ok=1#fragment');
if (redactedUrl !== '/metrics?token=[REDACTED]&ok=1#fragment') {
  throw new Error('sensitive URL query token was not redacted');
}
if (redactedUrl.includes('query-token')) throw new Error('raw URL query token leaked');

const encodedKeyUrl = logger.redactUrl('/api?api%5Fkey=secret-key&name=coffee');
if (encodedKeyUrl !== '/api?api%5Fkey=[REDACTED]&name=coffee') {
  throw new Error('encoded sensitive URL query key was not redacted');
}

const request = {
  method: 'POST',
  originalUrl: '/admin?password=plain-password&tab=orders',
  headers: {
    authorization: 'Bearer sensitive-token',
    cookie: 'sid=sensitive-cookie',
    'x-metrics-token': 'metrics-secret'
  },
  body: {
    username: 'admin',
    password: 'plain-password',
    nested: { refreshToken: 'refresh-secret' }
  },
  query: { token: 'query-token' },
  params: { id: '123' },
  ip: '127.0.0.1'
};

const errorWithCause = new Error('outer failure', {
  cause: new Error('inner failure')
});
errorWithCause.details = { token: 'error-token', safe: 'kept' };
let capturedErrorLog;
const originalError = logger.error;
logger.error = function captureLog(entry) {
  capturedErrorLog = entry;
};
try {
  logger.logError(errorWithCause, request, {
    token: 'data-token',
    nested: { apiKey: 'api-secret' },
    url: '/status?session=sensitive-session&ok=1'
  });
} finally {
  logger.error = originalError;
}

if (!capturedErrorLog) throw new Error('logger.logError did not emit an error entry');
if (capturedErrorLog.cause.message !== 'inner failure') throw new Error('error cause was not serialized');
if (capturedErrorLog.details.token !== '[REDACTED]') throw new Error('error details token was not redacted');
if (capturedErrorLog.details.safe !== 'kept') throw new Error('non-sensitive error details should be preserved');
if (capturedErrorLog.data.token !== '[REDACTED]') throw new Error('log data token was not redacted');
if (capturedErrorLog.data.nested.apiKey !== '[REDACTED]') throw new Error('nested log data API key was not redacted');
if (capturedErrorLog.data.url.includes('sensitive-session')) throw new Error('sensitive log data URL query leaked');
if (!capturedErrorLog.data.url.includes('ok=1')) throw new Error('non-sensitive URL query field should be preserved');
if (capturedErrorLog.request.headers.authorization !== '[REDACTED]') throw new Error('authorization was not redacted');
if (capturedErrorLog.request.headers.cookie !== '[REDACTED]') throw new Error('cookie was not redacted');
if (capturedErrorLog.request.headers['x-metrics-token'] !== '[REDACTED]') throw new Error('metrics token was not redacted');
if (capturedErrorLog.request.body.password !== '[REDACTED]') throw new Error('password was not redacted');
if (capturedErrorLog.request.body.nested.refreshToken !== '[REDACTED]') throw new Error('nested token was not redacted');
if (capturedErrorLog.request.query.token !== '[REDACTED]') throw new Error('query token was not redacted');
if (capturedErrorLog.request.body.username !== 'admin') throw new Error('non-sensitive fields should be preserved');
if (capturedErrorLog.request.url.includes('plain-password')) throw new Error('sensitive request URL query leaked');
if (!capturedErrorLog.request.url.includes('tab=orders')) throw new Error('non-sensitive request URL query field should be preserved');

let capturedNonErrorLog;
logger.error = function captureLog(entry) {
  capturedNonErrorLog = entry;
};
try {
  logger.logError({ token: 'non-error-token', safe: 'kept' });
} finally {
  logger.error = originalError;
}
if (!capturedNonErrorLog) throw new Error('logger.logError did not emit a non-Error entry');
if (capturedNonErrorLog.message.includes('non-error-token')) throw new Error('non-Error log value leaked through message');
if (capturedNonErrorLog.details.token !== '[REDACTED]') throw new Error('non-Error details token was not redacted');
if (capturedNonErrorLog.details.safe !== 'kept') throw new Error('non-Error details should be preserved');
`;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: rootDir,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error(`Logger redaction verification failed:\n${result.stdout}\n${result.stderr}`);
  }

  const loggerSource = fs.readFileSync(path.join(rootDir, 'src/utils/logger.js'), 'utf8');
  if (/logger\.serializeErrorForLog\s*=/.test(loggerSource)) {
    throw new Error('logger error serialization internals must not be re-exported as public runtime properties.');
  }
  if (/const decodeQueryKey\s*=/.test(loggerSource) || !/decodeURIComponent\(key\.replace\(\/\\\+\/g, ' '\)\)/.test(loggerSource)) {
    throw new Error('logger.redactUrl must decode query keys inline instead of keeping a single-use decodeQueryKey wrapper.');
  }

  const loggingMiddlewareSource = fs.readFileSync(path.join(rootDir, 'src/middleware/logging.middleware.js'), 'utf8');
  if ((loggingMiddlewareSource.match(/logger\.redactSensitiveData/g) || []).length < 2) {
    throw new Error('Security request logs must redact suspicious request body and headers.');
  }
  if (!/morgan\.token\('safe-url'/.test(loggingMiddlewareSource)) {
    throw new Error('Morgan access logs must use a redacted URL token.');
  }
  if (loggingMiddlewareSource.includes(':url')) {
    throw new Error('Morgan access log format must not use raw :url.');
  }
  if ((loggingMiddlewareSource.match(/logger\.redactUrl/g) || []).length < 4) {
    throw new Error('Request warning/security logs must redact URL query strings.');
  }

  const errorMiddlewareSource = fs.readFileSync(path.join(rootDir, 'src/middleware/error.middleware.js'), 'utf8');
  if (/\$\{\s*req\.originalUrl\s*\}/.test(errorMiddlewareSource)) {
    throw new Error('404 error messages must not interpolate raw req.originalUrl.');
  }
  if (!/logger\.redactUrl\(req\.originalUrl \|\| req\.url\)/.test(errorMiddlewareSource)) {
    throw new Error('404 error messages must redact URL query strings.');
  }

  console.log('ok logger redaction');
};

const verifyJavaScript = () => {
  const sourceFiles = [
    ...walk(path.join(rootDir, 'src'), (filePath) => filePath.endsWith('.js')),
    ...walk(path.join(rootDir, 'scripts'), (filePath) => filePath.endsWith('.js')),
    path.join(rootDir, 'public/js/admin.js')
  ].filter((filePath, index, allFiles) => (
    fs.existsSync(filePath) && allFiles.indexOf(filePath) === index
  )).sort();

  sourceFiles.forEach(checkJavaScript);
  console.log(`ok JavaScript syntax (${sourceFiles.length} files)`);
};

const verifyEjs = () => {
  const templateFiles = [
    ...walk(path.join(rootDir, 'src/views'), (filePath) => filePath.endsWith('.ejs'))
  ].filter((filePath, index, allFiles) => (
    fs.existsSync(filePath) && allFiles.indexOf(filePath) === index
  )).sort();

  templateFiles.forEach(compileTemplate);

  const errorViewPath = path.join(rootDir, 'src/views/error.ejs');
  const layoutPath = path.join(rootDir, 'src/views/layouts/admin.ejs');
  const errorBody = renderTemplate(errorViewPath, {
    error: { message: 'Internal Server Error' }
  });
  const renderedErrorPage = renderTemplate(layoutPath, {
    title: 'Error',
    body: errorBody,
    csrfToken: 'static-error-view-csrf-token',
    success: [],
    error: [],
    currentPage: '',
    kioskFrontendUrl: '',
    script: ''
  });

  if (
    !renderedErrorPage.includes('요청을 처리할 수 없습니다') ||
    !renderedErrorPage.includes('static-error-view-csrf-token') ||
    !renderedErrorPage.includes('AIOSK 관리자')
  ) {
    throw new Error('Web admin error view must render inside the admin layout with required locals.');
  }

  console.log(`ok EJS compile (${templateFiles.length} files)`);
};

const main = () => {
  verifyJavaScript();
  verifyEjs();
  verifyAdminLayoutScriptSlot();
  verifyNoTemporaryRuntimeMarkers();
  verifyNoDeadExampleEnvKeys();
  verifyLoggingEnvContract();
  verifyNoTrackedRuntimeArtifacts();
  verifyPrunedArtifactsAbsent();
  verifyBackendRequireGraph();
  verifyFrontendSourceGraph();
  verifyShellSyntaxScriptCoverage();
  verifyPackageScriptFileReferences();
  verifyLiveDocPackageScriptReferences();
  verifyLiveScriptPathReferences();
  verifyDockerBuildContextContract();
  verifyBackendRuntimeLogging();
  verifyStaticAssets();
  verifyAdminVendorAssets();
  verifyBrowserE2eContract();
  verifyE2ePortConfigContract();
  verifyAdminFlashMiddlewareContract();
  verifyFrontendPublicSurface();
  verifyDocumentationStructure();
  verifyDatabaseSchemaContract();
  verifyUploadConfigContract();
  verifyReadinessConfigContract();
  verifyRequestBodyLimitContract();
  verifyRateLimitContract();
  verifyShutdownTimeoutContract();
  verifyMetricsPreflightContract();
  verifyHeartbeatSoakContract();
  verifyDeploymentSmokeContract();
  verifySwaggerServerUrlContract();
  verifyAdminLoginOpenApiContract();
  verifyAdminMenuOpenApiContract();
  verifyAdminStatisticsOpenApiContract();
  verifyPublicOpenApiContracts();
  verifyOpenApiPathCoverage();
  verifyWebAdminCsrfContract();
  verifyAuthFailureLogging();
  verifyAdminExternalLinks();
  verifyEnvSecretFileLoader();
  verifyDbBackupAtomicOutput();
  verifyDbRestoreGzipPreflight();
  verifyDbRestoreSafetyFlagContract();
  verifyDbShellComposeEnvContracts();
  verifyDbMigrationEnvContract();
  verifyDeployMigrationContract();
  verifyAdminCreateEnvContract();
  verifyProductionPreflightOperationalPasswordContract();
  verifyProductionPreflightSecretFileContract();
  verifyProductionPreflightEnvParserContract();
  verifyProductionPreflightControlFlagContract();
  verifyProductionPreflightNumericContract();
  verifyProductionPreflightComposePortContract();
  verifyProductionRuntimeConfigGuard();
  verifyGracefulShutdownContract();
  verifyWorkflowPackageScriptReferences();
  verifyWorkflowLocalPathReferences();
  verifyWorkflowReleaseGuards();
  verifyFrontendApiUrlGuards();
  verifyHtmlInjectionGuards();
  verifyCsvExportGuards();
  verifyLoggerRedaction();
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
