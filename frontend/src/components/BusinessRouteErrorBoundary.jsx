import { Component } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button } from './ui';

/**
 * Catches render errors in Business Edition routes so users see a message instead of a blank screen.
 */
export default class BusinessRouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="page-container mx-auto max-w-lg space-y-4 py-8">
          <Card className="border-danger-200 bg-danger-50 p-5" role="alert">
            <h2 className="text-title text-danger-800">Business page failed to load</h2>
            <p className="text-body mt-2 text-danger-700">
              Something went wrong rendering this page. Try reloading or return to your dashboard.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="primary" onClick={() => window.location.reload()}>
                Reload page
              </Button>
              <Link to="/edition" className="inline-flex">
                <Button type="button" variant="secondary">Edition chooser</Button>
              </Link>
            </div>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
