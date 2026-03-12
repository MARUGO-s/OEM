import { Menu, Search, Upload, Bell, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import './Header.css';

interface HeaderProps {
  onMenuClick: () => void;
  onUploadClick: () => void;
}

export function Header({ onMenuClick, onUploadClick }: HeaderProps) {
  return (
    <header className="app-header glass-panel">
      <div className="header-left">
        <button className="icon-button" onClick={onMenuClick}>
          <Menu size={24} />
        </button>
        <Link to="/" className="logo-container">
          <div className="logo-icon">►</div>
          <span className="logo-text">CompanyTube</span>
        </Link>
      </div>

      <div className="header-center">
        <div className="search-box">
          <input type="text" placeholder="マニュアルを検索..." />
          <button className="search-button">
            <Search size={20} />
          </button>
        </div>
      </div>

      <div className="header-right">
        <button className="icon-button header-action hover-scale" onClick={onUploadClick} title="動画をアップロード">
          <Upload size={20} />
        </button>
        <button className="icon-button header-action hover-scale" title="通知">
          <Bell size={20} />
        </button>
        <button className="icon-button user-profile hover-scale" title="プロフィール">
          <User size={20} />
        </button>
      </div>
    </header>
  );
}
