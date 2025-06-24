// AIOSK 관리자 패널 JavaScript

// 전역 변수
let socket;
let notificationCount = 0;

// 페이지 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// 앱 초기화
function initializeApp() {
    // Socket.IO 연결
    initializeSocket();
    
    // 알림 초기화
    initializeNotifications();
    
    // 실시간 시계 시작
    startClock();
    
    // Bootstrap 툴팁 초기화
    initializeTooltips();
    
    // 키보드 단축키 설정
    setupKeyboardShortcuts();
}

// Socket.IO 초기화
function initializeSocket() {
    if (typeof io !== 'undefined') {
        socket = io();
        
        socket.on('connect', function() {
            console.log('✅ 관리자 패널 연결됨');
            updateConnectionStatus(true);
        });
        
        socket.on('disconnect', function() {
            console.log('❌ 관리자 패널 연결 끊김');
            updateConnectionStatus(false);
        });
        
        // 새 주문 알림
        socket.on('newOrder', function(orderData) {
            handleNewOrderNotification(orderData);
        });
        
        // 주문 상태 변경 알림
        socket.on('orderStatusChanged', function(data) {
            handleOrderStatusChange(data);
        });
        
        // 시스템 알림
        socket.on('systemNotification', function(notification) {
            showSystemNotification(notification);
        });
    }
}

// 연결 상태 업데이트
function updateConnectionStatus(isConnected) {
    const statusElements = document.querySelectorAll('#connectionStatus');
    statusElements.forEach(element => {
        if (element) {
            element.textContent = isConnected ? '연결됨' : '연결 끊김';
            element.className = isConnected ? 'h6 text-success' : 'h6 text-danger';
        }
    });
}

// 새 주문 알림 처리
function handleNewOrderNotification(orderData) {
    // 알림 카운트 증가
    notificationCount++;
    updateNotificationBadge();
    
    // 알림 목록에 추가
    addNotificationToList({
        id: orderData.id,
        message: `새 주문 #${String(orderData.id).padStart(4, '0')} (${(orderData.totalPrice || 0).toLocaleString()}원)`,
        time: new Date().toLocaleTimeString('ko-KR'),
        type: 'order'
    });
    
    // 사운드 알림 (선택사항)
    playNotificationSound();
    
    // 브라우저 알림 (권한이 있는 경우)
    showBrowserNotification('새 주문 접수', `주문번호 #${String(orderData.id).padStart(4, '0')}`);
    
    // 주문 관리 페이지에 있는 경우 실시간 업데이트
    if (window.location.pathname === '/admin/orders') {
        updateOrdersPage(orderData);
    }
}

// 주문 상태 변경 처리
function handleOrderStatusChange(data) {
    console.log('주문 상태 변경:', data);
    
    // 주문 관리 페이지에서 실시간 업데이트
    if (window.location.pathname === '/admin/orders') {
        const statusElement = document.getElementById(`status-${data.orderId}`);
        if (statusElement) {
            const statusTexts = {
                'RECEIVED': '접수',
                'PREPARING': '준비중',
                'COMPLETED': '완료',
                'CANCELED': '취소'
            };
            
            const statusColors = {
                'RECEIVED': 'warning',
                'PREPARING': 'info',
                'COMPLETED': 'success',
                'CANCELED': 'secondary'
            };
            
            statusElement.textContent = statusTexts[data.status];
            statusElement.className = `badge bg-${statusColors[data.status]}`;
        }
    }
}

// 시스템 알림 표시
function showSystemNotification(notification) {
    const alertHtml = `
        <div class="alert alert-${notification.type} alert-dismissible fade show" role="alert">
            <i class="bi bi-${notification.icon || 'info-circle'}"></i>
            ${notification.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    const container = document.querySelector('.container-fluid');
    if (container) {
        container.insertAdjacentHTML('afterbegin', alertHtml);
        
        // 5초 후 자동 제거
        setTimeout(() => {
            const alert = container.querySelector('.alert');
            if (alert) {
                alert.remove();
            }
        }, 5000);
    }
}

// 알림 초기화
function initializeNotifications() {
    // 브라우저 알림 권한 요청
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// 알림 배지 업데이트
function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        badge.textContent = notificationCount;
        badge.style.display = notificationCount > 0 ? 'block' : 'none';
    }
}

// 알림 목록에 추가
function addNotificationToList(notification) {
    const notificationList = document.getElementById('notificationList');
    if (notificationList) {
        const notificationHtml = `
            <li class="notification-item">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h6 class="mb-1">${notification.message}</h6>
                        <small class="text-muted">${notification.time}</small>
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
    }
}

// 브라우저 알림 표시
function showBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: '/favicon.ico',
            badge: '/favicon.ico'
        });
    }
}

// 알림 사운드 재생
function playNotificationSound() {
    // 웹 오디오 API를 사용한 간단한 알림음
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        console.log('사운드 재생 실패:', error);
    }
}

// 실시간 시계 시작
function startClock() {
    function updateTime() {
        const timeElements = document.querySelectorAll('#currentTime');
        const now = new Date();
        const timeString = now.toLocaleTimeString('ko-KR');
        
        timeElements.forEach(element => {
            if (element) {
                element.textContent = ` - ${timeString}`;
            }
        });
    }
    
    updateTime();
    setInterval(updateTime, 1000);
}

// Bootstrap 툴팁 초기화
function initializeTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

// 키보드 단축키 설정
function setupKeyboardShortcuts() {
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
}

// 유틸리티 함수들
const AdminUtils = {
    // 숫자 포맷팅
    formatNumber: function(num) {
        return new Intl.NumberFormat('ko-KR').format(num);
    },
    
    // 날짜 포맷팅
    formatDate: function(date, options = {}) {
        const defaultOptions = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        };
        return new Date(date).toLocaleString('ko-KR', { ...defaultOptions, ...options });
    },
    
    // 상태 텍스트 변환
    getStatusText: function(status) {
        const statusMap = {
            'RECEIVED': '접수',
            'PREPARING': '준비중',
            'COMPLETED': '완료',
            'CANCELED': '취소'
        };
        return statusMap[status] || status;
    },
    
    // 상태 색상 클래스 변환
    getStatusColor: function(status) {
        const colorMap = {
            'RECEIVED': 'warning',
            'PREPARING': 'info',
            'COMPLETED': 'success',
            'CANCELED': 'secondary'
        };
        return colorMap[status] || 'secondary';
    },
    
    // 로딩 스피너 표시/숨김
    showLoading: function(element) {
        if (element) {
            element.innerHTML = '<span class="loading-spinner"></span> 로딩 중...';
            element.disabled = true;
        }
    },
    
    hideLoading: function(element, originalText) {
        if (element) {
            element.innerHTML = originalText;
            element.disabled = false;
        }
    },
    
    // 성공 메시지 표시
    showSuccess: function(message) {
        AdminUtils.showAlert(message, 'success');
    },
    
    // 오류 메시지 표시
    showError: function(message) {
        AdminUtils.showAlert(message, 'danger');
    },
    
    // 경고 메시지 표시
    showWarning: function(message) {
        AdminUtils.showAlert(message, 'warning');
    },
    
    // 정보 메시지 표시
    showInfo: function(message) {
        AdminUtils.showAlert(message, 'info');
    },
    
    // 일반 알림 표시
    showAlert: function(message, type = 'info') {
        const alertHtml = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        
        const container = document.querySelector('.container-fluid');
        if (container) {
            container.insertAdjacentHTML('afterbegin', alertHtml);
            
            // 5초 후 자동 제거
            setTimeout(() => {
                const alert = container.querySelector('.alert');
                if (alert) {
                    const bsAlert = new bootstrap.Alert(alert);
                    bsAlert.close();
                }
            }, 5000);
        }
    }
};

// 전역 스코프에 유틸리티 함수 노출
window.AdminUtils = AdminUtils;

// 페이지 성능 모니터링
window.addEventListener('load', function() {
    const loadTime = performance.now();
    console.log(`📊 페이지 로드 시간: ${Math.round(loadTime)}ms`);
});

// 에러 핸들링
window.addEventListener('error', function(event) {
    console.error('JavaScript 오류:', event.error);
    AdminUtils.showError('일시적인 오류가 발생했습니다. 페이지를 새로고침해 주세요.');
});

// 오프라인/온라인 상태 감지
window.addEventListener('online', function() {
    AdminUtils.showSuccess('인터넷 연결이 복구되었습니다.');
});

window.addEventListener('offline', function() {
    AdminUtils.showWarning('인터넷 연결이 끊어졌습니다. 일부 기능이 제한될 수 있습니다.');
});
