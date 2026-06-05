import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="mt-8 border-t border-border py-5">
      <div className="mb-2 flex flex-wrap justify-center gap-x-5 gap-y-2">
        <Link to="/terms" className="text-caption transition-colors hover:text-foreground">
          Terms of Service
        </Link>
        <Link to="/privacy" className="text-caption transition-colors hover:text-foreground">
          Privacy Policy
        </Link>
        <Link to="/cookies" className="text-caption transition-colors hover:text-foreground">
          Cookie Policy
        </Link>
        <Link to="/disclaimer" className="text-caption transition-colors hover:text-foreground">
          Disclaimer
        </Link>
      </div>
      <p className="text-caption text-center">
        &copy; 2026 SP Software Solutions LLC. All rights reserved.
      </p>
    </footer>
  );
}
