(function(){
    async function exportRoadmapToPDF() {
        const container = document.getElementById('roadmap-container');
        if (!container) {
            alert('ロードマップが見つかりません。');
            return;
        }

        // 一時的に印刷用にスタイルを最適化
        const originalTransform = container.style.transform;
        const originalTransition = container.style.transition;
        container.style.transform = 'none';
        container.style.transition = 'none';

        // 高解像度でキャプチャ
        const scale = 2; // 倍率を上げて文字やタグの可読性を確保
        const canvas = await html2canvas(container, {
            scale,
            useCORS: true,
            backgroundColor: '#ffffff',
            windowWidth: container.scrollWidth,
            windowHeight: container.scrollHeight
        });

        // 元のスタイルを戻す
        container.style.transform = originalTransform;
        container.style.transition = originalTransition;

        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

        // A4の描画領域
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        // 画像サイズ（ptに変換）
        const imgWidth = pageWidth - 48; // 両端24ptの余白
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // ページ分割（縦に長い場合に対応）
        let remainingHeight = imgHeight;
        let positionY = 24; // 上余白
        let offset = 0;

        // タイトル
        pdf.setFontSize(14);
        pdf.text('ロードマップ', 24, 24);
        positionY = 48;

        while (remainingHeight > 0) {
            const sliceHeight = Math.min(remainingHeight, pageHeight - positionY - 24); // 下余白24pt
            // キャンバスをスライスしてページごとに描画
            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = canvas.width;
            pageCanvas.height = Math.floor((sliceHeight * canvas.width) / imgWidth);
            const ctx = pageCanvas.getContext('2d');
            ctx.drawImage(
                canvas,
                0,
                Math.floor((offset * canvas.width) / imgWidth),
                canvas.width,
                pageCanvas.height,
                0,
                0,
                pageCanvas.width,
                pageCanvas.height
            );

            const pageImg = pageCanvas.toDataURL('image/png');
            const pageImgHeight = sliceHeight;

            pdf.addImage(pageImg, 'PNG', 24, positionY, imgWidth, pageImgHeight, undefined, 'FAST');

            remainingHeight -= sliceHeight;
            offset += sliceHeight;

            if (remainingHeight > 0) {
                pdf.addPage();
                positionY = 24; // 次ページは上から
            }
        }

        pdf.save(`roadmap_${new Date().toISOString().slice(0,10)}.pdf`);
    }

    // ボタンにイベントを割り当て
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('export-roadmap-pdf-btn');
        if (btn && !btn.dataset.listenerAttached) {
            btn.addEventListener('click', exportRoadmapToPDF);
            btn.dataset.listenerAttached = 'true';
        }
    });

    // グローバル公開（必要なら）
    window.exportRoadmapToPDF = exportRoadmapToPDF;
})();
