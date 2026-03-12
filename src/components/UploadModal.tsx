import React, { useState } from 'react';
import { X, UploadCloud, CheckCircle } from 'lucide-react';
import './UploadModal.css';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UploadModal({ isOpen, onClose }: UploadModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Select File, 2: Details, 3: Success

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setStep(2);
  };

  const handleFileSelect = () => {
    setStep(2);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(3);
  };

  const handleClose = () => {
    setStep(1);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel">
        <div className="modal-header">
          <h2>動画のアップロード</h2>
          <button className="icon-button close-button" onClick={handleClose}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body">
          {step === 1 && (
            <div 
              className="drop-zone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
            >
              <div className="drop-icon-circle">
                <UploadCloud size={48} color="#aaa" />
              </div>
              <h3>動画ファイルをドラッグ＆ドロップしてアップロード</h3>
              <p className="text-muted">または</p>
              <button className="btn-primary" onClick={handleFileSelect}>
                ファイルを選択
              </button>
            </div>
          )}

          {step === 2 && (
            <form className="upload-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label>タイトル (必須)</label>
                <input type="text" placeholder="マニュアル動画のタイトルを入力" required />
              </div>
              <div className="form-group">
                <label>説明 (必須)</label>
                <textarea rows={4} placeholder="動画の概要や注意事項を入力" required></textarea>
              </div>
              <div className="form-group">
                <label>部門</label>
                <select>
                  <option>全社共通</option>
                  <option>営業部</option>
                  <option>IT部門</option>
                  <option>人事・総務部</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="button" className="action-button standalone-action" onClick={() => setStep(1)}>
                  戻る
                </button>
                <button type="submit" className="btn-primary">
                  公開する
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <div className="success-zone">
              <CheckCircle size={64} color="#4caf50" />
              <h3>アップロード完了</h3>
              <p>動画の公開処理が完了しました。</p>
              <button className="btn-primary" onClick={handleClose} style={{ marginTop: '20px' }}>
                閉じる
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
