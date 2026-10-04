import { useState } from 'react';

type TopNavProps = {
  onLogin?: () => void;
  onLogout?: () => void;
};

export default function TopNav({ onLogin, onLogout }: TopNavProps) {
  const [open, setOpen] = useState(false);

  const handleLogin = () => {
    setOpen(false);
    onLogin?.();
  };

  const handleLogout = () => {
    setOpen(false);
    onLogout?.();
  };

  return (
    <header className="topnav" role="banner">
      <div className="topnav-left">
        <div className="brand" title="BumbleBee">
        <nav className="nav-actions" role="navigation" aria-label="Main menu">
          <ul id="topnav-menu" className={`nav-list ${open ? 'open' : ''}`}>
            <li>
              <span
                role="button"
                tabIndex={0}
                className="nav-link text-dark small nav-span"
                onClick={handleLogin}
                onKeyDown={(e: any) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleLogin();
                  }
                }}
              >
                Login
              </span>
            </li>
            <li>
              <span
                role="button"
                tabIndex={0}
                className="nav-link text-dark small nav-span"
                onClick={handleLogout}
                onKeyDown={(e: any) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleLogout();
                  }
                }}
              >
                Logout
              </span>
            </li>
          </ul>

          <button
            className="hamburger"
            aria-label="Menu"
            aria-controls="topnav-menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            type="button"
          >
            <span />
            <span />
            <span />
          </button>
        </nav>

          <div className="title">BumbleBee</div>
        </div>
      </div>

      <div className="topnav-right">
          <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/images/logo_bk.jpg" alt="Bach Khoa Da Nang logo" className="logo-img" />
            <img 
              src="/images/logo_FAST.jpg" 
              alt="FAST logo" 
              className="logo-img"
              style={{ width: 60, height: 60, objectFit: 'contain' }}
            />
          </div>
      </div>
    </header>
  );
}
