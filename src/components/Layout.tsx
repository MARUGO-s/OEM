import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { UploadModal } from './UploadModal';

export function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleUploadClick = () => {
    setIsUploadModalOpen(true);
  };

  return (
    <div className="app-container">
      <Header onMenuClick={toggleSidebar} onUploadClick={handleUploadClick} />
      <div className="main-content">
        <Sidebar isOpen={isSidebarOpen} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
      <UploadModal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} />
    </div>
  );
}
