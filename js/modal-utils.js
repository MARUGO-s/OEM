// モーダル管理ユーティリティ
// キャッシュ問題を回避するための新しいファイル

// モーダル状態管理
const ModalManager = {
    isOpen: false,
    
    // モーダルを開く
    open: function(modalId) {
        console.log('ModalManager.open が呼び出されました:', modalId);
        
        if (this.isOpen) {
            console.log('モーダルは既に開いています');
            return false;
        }
        
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error('モーダル要素が見つかりません:', modalId);
            return false;
        }
        
        try {
            modal.classList.add('active');
            this.isOpen = true;
            console.log('モーダルが正常に開かれました:', modalId);
            return true;
        } catch (error) {
            console.error('モーダルを開く際にエラーが発生しました:', error);
            return false;
        }
    },
    
    // モーダルを閉じる
    close: function(modalId) {
        console.log('ModalManager.close が呼び出されました:', modalId);
        
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error('モーダル要素が見つかりません:', modalId);
            return false;
        }
        
        try {
            modal.classList.remove('active');
            this.isOpen = false;
            console.log('モーダルが正常に閉じられました:', modalId);
            return true;
        } catch (error) {
            console.error('モーダルを閉じる際にエラーが発生しました:', error);
            return false;
        }
    },
    
    // モーダルの状態をリセット
    reset: function() {
        this.isOpen = false;
        console.log('モーダル状態がリセットされました');
    }
};

// グローバル関数として公開
window.openModal = function(modalId = 'task-modal') {
    return ModalManager.open(modalId);
};

window.closeModal = function(modalId = 'task-modal') {
    return ModalManager.close(modalId);
};

window.resetModalState = function() {
    ModalManager.reset();
};

console.log('modal-utils.js が読み込まれました');
