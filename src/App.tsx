import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { VideoPlayerPage } from './pages/VideoPlayerPage';

// Placeholder pages
const NotFound = () => <div><h2>Not Found</h2></div>;

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="watch/:videoId" element={<VideoPlayerPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default App;
