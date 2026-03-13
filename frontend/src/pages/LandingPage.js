import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function LandingPage() {
  const location = useLocation();

  useEffect(() => {
    const targetUrl = `/lpbuild/index.html${location.search || ''}`;
    window.location.replace(targetUrl);
  }, [location.search]);

  return null;
}
