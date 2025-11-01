// モバイル最適化機能

// タッチ操作の最適化
function optimizeTouchEvents() {
    // タッチデバイスでのホバー効果を無効化
    if ('ontouchstart' in window) {
        document.body.classList.add('touch-device');
    }
    
    // ダブルタップズームを防止
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (event) => {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, false);
}

// スワイプジェスチャーの実装
function initSwipeGestures() {
    let startX = 0;
    let startY = 0;
    let endX = 0;
    let endY = 0;

    document.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    });

    document.addEventListener('touchend', (e) => {
        endX = e.changedTouches[0].clientX;
        endY = e.changedTouches[0].clientY;
        handleSwipe();
    });

    function handleSwipe() {
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        const minSwipeDistance = 50;

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // 横スワイプ
            if (Math.abs(deltaX) > minSwipeDistance) {
                if (deltaX > 0) {
                    // 右スワイプ - 通知パネルを閉じる
                    const notificationPanel = document.getElementById('notification-panel');
                    if (notificationPanel && notificationPanel.classList.contains('open')) {
                        notificationPanel.classList.remove('open');
                    }
                } else {
                    // 左スワイプ - 通知パネルを開く
                    const notificationBell = document.getElementById('notification-bell');
                    if (notificationBell) {
                        notificationBell.click();
                    }
                }
            }
        }
    }
}

// プルツーリフレッシュの実装
function initPullToRefresh() {
    let startY = 0;
    let currentY = 0;
    let isPulling = false;
    const pullThreshold = 80;

    document.addEventListener('touchstart', (e) => {
        if (window.scrollY === 0) {
            startY = e.touches[0].clientY;
            isPulling = true;
        }
    });

    document.addEventListener('touchmove', (e) => {
        if (isPulling) {
            currentY = e.touches[0].clientY;
            const pullDistance = currentY - startY;
            
            if (pullDistance > 0) {
                e.preventDefault();
                document.body.style.transform = `translateY(${Math.min(pullDistance * 0.5, pullThreshold)}px)`;
                
                if (pullDistance > pullThreshold) {
                    document.body.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                }
            }
        }
    });

    document.addEventListener('touchend', (e) => {
        if (isPulling) {
            const pullDistance = currentY - startY;
            
            document.body.style.transform = '';
            document.body.style.background = '';
            isPulling = false;
            
            if (pullDistance > pullThreshold) {
                // リフレッシュ実行
                window.location.reload();
            }
        }
    });
}

// キーボード表示時のレイアウト調整
function handleKeyboardResize() {
    const initialViewportHeight = window.innerHeight;
    
    window.addEventListener('resize', () => {
        const currentHeight = window.innerHeight;
        const heightDifference = initialViewportHeight - currentHeight;
        
        if (heightDifference > 150) {
            // キーボードが表示されている
            document.body.classList.add('keyboard-open');
        } else {
            // キーボードが隠れている
            document.body.classList.remove('keyboard-open');
        }
    });
}

// ネットワーク状態の監視
function initNetworkStatus() {
    function updateNetworkStatus() {
        const status = navigator.onLine ? 'online' : 'offline';
        document.body.classList.remove('online', 'offline');
        document.body.classList.add(status);
        
        if (status === 'offline') {
            showOfflineMessage();
        } else {
            hideOfflineMessage();
        }
    }
    
    function showOfflineMessage() {
        let offlineMessage = document.getElementById('offline-message');
        if (!offlineMessage) {
            offlineMessage = document.createElement('div');
            offlineMessage.id = 'offline-message';
            offlineMessage.innerHTML = `
                <div style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    background: #f59e0b;
                    color: white;
                    text-align: center;
                    padding: 8px;
                    z-index: 1000;
                    font-size: 14px;
                ">
                    📱 オフライン中 - 接続復旧時に自動同期されます
                </div>
            `;
            document.body.appendChild(offlineMessage);
        }
    }
    
    function hideOfflineMessage() {
        const offlineMessage = document.getElementById('offline-message');
        if (offlineMessage) {
            offlineMessage.remove();
        }
    }
    
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();
}

// パフォーマンス最適化
function optimizePerformance() {
    // 画像の遅延読み込み
    const images = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                imageObserver.unobserve(img);
            }
        });
    });
    
    images.forEach(img => imageObserver.observe(img));
    
    // スクロール最適化
    let ticking = false;
    function updateScrollPosition() {
        const scrollY = window.scrollY;
        document.body.classList.toggle('scrolled', scrollY > 10);
        ticking = false;
    }
    
    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(updateScrollPosition);
            ticking = true;
        }
    });
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    optimizeTouchEvents();
    initSwipeGestures();
    initPullToRefresh();
    handleKeyboardResize();
    initNetworkStatus();
    optimizePerformance();
    
    console.log('📱 モバイル最適化機能が有効になりました');
});
