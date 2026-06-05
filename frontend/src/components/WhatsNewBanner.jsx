import { Link } from 'react-router-dom';
import { Sparkles, ChevronRight } from 'lucide-react';
import { whatsNew } from '../lib/productUpdates';
import { Badge, Card, cn } from './ui';

export default function WhatsNewBanner({ className, compact = false }) {
  if (!whatsNew?.title) return null;

  return (
    <Card
      className={cn(
        'border-accent-200/60 bg-gradient-to-br from-accent-50 to-surface p-5 sm:p-6 dark:from-accent-50/80',
        className,
      )}
      role="region"
      aria-labelledby="whats-new-heading"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-100 text-accent-700" aria-hidden>
              <Sparkles className="h-4 w-4" />
            </span>
            <Badge variant="info" className="normal-case">
              What&apos;s New
            </Badge>
            {whatsNew.released && (
              <span className="text-caption tabular-nums">{whatsNew.released}</span>
            )}
          </div>
          <h2 id="whats-new-heading" className="text-title">
            {whatsNew.title}
          </h2>
          <p className="text-body mt-2 max-w-2xl">{whatsNew.summary}</p>
          {!compact && Array.isArray(whatsNew.highlights) && whatsNew.highlights.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm text-foreground">
              {whatsNew.highlights.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Link
          to="/changelog"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-accent-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Full changelog
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}
