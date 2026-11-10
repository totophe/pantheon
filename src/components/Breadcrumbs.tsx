import type { Crumb } from '../model/types';
import { LinkButton } from './ui';

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="crumbs">
      {crumbs.map((c, i) => (
        <span key={i} className="crumb">
          {c.link ? (
            <>
              <LinkButton onClick={c.go} className="crumb-link">{c.t}</LinkButton>
              <span aria-hidden="true">/</span>
            </>
          ) : (
            <span className="crumb-current" aria-current="page">{c.t ?? 'Not found'}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
