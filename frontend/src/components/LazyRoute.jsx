import { Suspense } from 'react';
import PageLoader from './PageLoader';

export default function LazyRoute({ children, label }) {
  return <Suspense fallback={<PageLoader label={label} />}>{children}</Suspense>;
}
