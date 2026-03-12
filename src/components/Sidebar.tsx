import { Home, Compass, FolderClosed, Users, History, HelpCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
}

export function Sidebar({ isOpen }: SidebarProps) {
  const location = useLocation();

  const primaryLinks = [
    { name: 'ホーム', icon: <Home size={22} />, path: '/' },
    { name: '新着マニュアル', icon: <Compass size={22} />, path: '/new' },
  ];

  const secondaryLinks = [
    { name: '部署別', icon: <Users size={22} />, path: '/departments' },
    { name: 'カテゴリ', icon: <FolderClosed size={22} />, path: '/categories' },
    { name: '履歴', icon: <History size={22} />, path: '/history' },
  ];

  return (
    <aside className={`app-sidebar ${isOpen ? 'open' : 'closed'}`}>
      <div className="sidebar-section">
        {primaryLinks.map((link) => (
          <Link
            key={link.name}
            to={link.path}
            className={`sidebar-link ${location.pathname === link.path ? 'active' : ''}`}
          >
            <div className="sidebar-icon">{link.icon}</div>
            <span className="sidebar-name">{link.name}</span>
          </Link>
        ))}
      </div>
      
      <div className="sidebar-divider" />
      
      <div className="sidebar-section">
        <div className="sidebar-section-title">ライブラリ</div>
        {secondaryLinks.map((link) => (
          <Link
            key={link.name}
            to={link.path}
            className={`sidebar-link ${location.pathname === link.path ? 'active' : ''}`}
          >
            <div className="sidebar-icon">{link.icon}</div>
            <span className="sidebar-name">{link.name}</span>
          </Link>
        ))}
      </div>

      <div className="sidebar-divider" />
      
      <div className="sidebar-section mt-auto">
        <Link to="/help" className="sidebar-link">
          <div className="sidebar-icon"><HelpCircle size={22} /></div>
          <span className="sidebar-name">ヘルプ＆サポート</span>
        </Link>
      </div>
    </aside>
  );
}
