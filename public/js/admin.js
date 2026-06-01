// AIOSK 관리자 패널 JavaScript

function escapeHtml(value) {
    const htmlEscapes = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    return String(value ?? '').replace(/[&<>"']/g, function(character) {
        return htmlEscapes[character];
    });
}

// 페이지 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', function() {
    let notificationCount = 0;

    const updateConnectionStatus = (isConnected) => {
        const statusElement = document.getElementById('connectionStatus');
        if (!statusElement) return;

        statusElement.textContent = isConnected ? '연결됨' : '연결 끊김';
        statusElement.className = isConnected ? 'h6 text-success' : 'h6 text-danger';
    };

    const handleOrderStatusChange = (data) => {
        // 주문 관리 페이지에서 실시간 업데이트
        if (window.location.pathname === '/admin/orders') {
            const statusElement = document.getElementById(`status-${data.orderId}`);
            if (statusElement) {
                const statusTexts = {
                    'RECEIVED': '접수',
                    'PREPARING': '준비중',
                    'COMPLETED': '완료',
                    'CANCELLED': '취소'
                };

                const statusColors = {
                    'RECEIVED': 'warning',
                    'PREPARING': 'info',
                    'COMPLETED': 'success',
                    'CANCELLED': 'secondary'
                };

                statusElement.textContent = statusTexts[data.status];
                statusElement.className = `badge bg-${statusColors[data.status]}`;
            }
        }
    };

    // Socket.IO 연결
    const adminSocket = io();

    adminSocket.on('connect', function() {
        updateConnectionStatus(true);
    });

    adminSocket.on('disconnect', function() {
        updateConnectionStatus(false);
    });

    // 새 주문 알림
    adminSocket.on('new_order', function(orderData) {
        const orderId = String(orderData.orderId).padStart(4, '0');

        // 알림 카운트 증가
        notificationCount++;
        const badge = document.getElementById('notificationBadge');
        badge.textContent = notificationCount;
        badge.style.display = 'block';

        // 알림 목록에 추가
        const notificationList = document.getElementById('notificationList');
        const notificationHtml = `
            <li class="notification-item">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h6 class="mb-1">${escapeHtml(`새 주문 #${orderId} (${orderData.totalPrice.toLocaleString()}원)`)}</h6>
                        <small class="text-muted">${escapeHtml(new Date().toLocaleTimeString('ko-KR'))}</small>
                    </div>
                    <span class="badge bg-primary rounded-pill">NEW</span>
                </div>
            </li>
        `;

        // 기존 "알림이 없습니다" 메시지 제거
        const emptyMessage = notificationList.querySelector('.dropdown-item-text');
        if (emptyMessage) {
            emptyMessage.remove();
        }

        notificationList.insertAdjacentHTML('beforeend', notificationHtml);

        // 최대 10개 알림만 유지
        const notifications = notificationList.querySelectorAll('.notification-item');
        if (notifications.length > 10) {
            notifications[0].remove();
        }

        // 사운드 알림 (선택사항)
        let audioContext = null;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                audioContext = new AudioContextClass();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                oscillator.type = 'sine';

                gainNode.gain.setValueAtTime(0, audioContext.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
                gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);

                oscillator.addEventListener('ended', function() {
                    if (audioContext.state === 'closed') return;
                    audioContext.close().catch(function() {
                        // Audio cleanup is best-effort after notification playback.
                    });
                }, { once: true });

                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.3);
            }
        } catch {
            if (audioContext && audioContext.state !== 'closed') {
                audioContext.close().catch(function() {
                    // Audio cleanup is best-effort after failed notification playback.
                });
            }
            // Notification sound is optional and may be blocked by browser policy.
        }

        // 브라우저 알림 (권한이 있는 경우)
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('새 주문 접수', {
                body: `주문번호 #${orderId}`,
                icon: '/favicon.svg',
                badge: '/favicon.svg'
            });
        }

        window.dispatchEvent(new CustomEvent('aiosk:new-order', { detail: orderData }));
    });

    // 주문 상태 변경 알림
    adminSocket.on('order_status_updated', function(data) {
        handleOrderStatusChange(data);
        window.dispatchEvent(new CustomEvent('aiosk:order-status-updated', { detail: data }));
    });

    adminSocket.on('order_cancelled', function(data) {
        handleOrderStatusChange(data);
        window.dispatchEvent(new CustomEvent('aiosk:order-cancelled', { detail: data }));
    });

    // 브라우저 알림 권한 요청
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    // 실시간 시계 시작
    const timeElement = document.getElementById('currentTime');
    const updateCurrentTime = () => {
        const now = new Date();
        const timeString = now.toLocaleTimeString('ko-KR');

        timeElement.textContent = ` - ${timeString}`;
    };

    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);

    // 키보드 단축키 설정
    document.addEventListener('keydown', function(event) {
        // Ctrl + R: 새로고침
        if (event.ctrlKey && event.key === 'r') {
            event.preventDefault();
            location.reload();
        }

        // Ctrl + D: 대시보드로 이동
        if (event.ctrlKey && event.key === 'd') {
            event.preventDefault();
            window.location.href = '/admin';
        }

        // Ctrl + O: 주문 관리로 이동
        if (event.ctrlKey && event.key === 'o') {
            event.preventDefault();
            window.location.href = '/admin/orders';
        }

        // Ctrl + M: 메뉴 관리로 이동
        if (event.ctrlKey && event.key === 'm') {
            event.preventDefault();
            window.location.href = '/admin/menus';
        }
    });
});

const showAlert = (message, type) => {
    const allowedTypes = ['success', 'danger', 'warning', 'info'];
    const safeType = allowedTypes.includes(type) ? type : 'info';
    const alertHtml = `
        <div class="alert alert-${safeType} alert-dismissible fade show" role="alert">
            ${escapeHtml(message)}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;

    const container = document.querySelector('.container-fluid');
    container.insertAdjacentHTML('afterbegin', alertHtml);
    const alert = container.querySelector('.alert');

    // 5초 후 자동 제거
    setTimeout(() => {
        if (!alert.isConnected) return;
        const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
        bsAlert.close();
    }, 5000);
};

// 에러 핸들링
window.addEventListener('error', function() {
    showAlert('일시적인 오류가 발생했습니다. 페이지를 새로고침해 주세요.', 'danger');
});

// 오프라인/온라인 상태 감지
window.addEventListener('online', function() {
    showAlert('인터넷 연결이 복구되었습니다.', 'success');
});

window.addEventListener('offline', function() {
    showAlert('인터넷 연결이 끊어졌습니다. 일부 기능이 제한될 수 있습니다.', 'warning');
});
