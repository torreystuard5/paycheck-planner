import { useBusinessAccess } from './useBusinessAccess';

const TRIAL_HINT = 'Business trial ended — subscribe to edit.';
const UPGRADE_HINT = 'Business access required to edit.';
const ROLE_HINT = 'Your role cannot perform this action.';

/**
 * Gate create/edit/delete controls on business pages.
 * @param {string|null} permission - e.g. manage_sales, manage_deductions
 */
export function useBusinessWrite(permission = null) {
  const { canWrite, can, trialExpired, loading } = useBusinessAccess();
  const hasPerm = permission ? can(permission) : true;
  const allowed = !loading && canWrite && hasPerm;

  let title;
  if (!allowed) {
    if (trialExpired) title = TRIAL_HINT;
    else if (!canWrite) title = UPGRADE_HINT;
    else if (permission && !hasPerm) title = ROLE_HINT;
  }

  const props = (extra = {}) => ({
    ...extra,
    disabled: !allowed || Boolean(extra.disabled),
    title: title || extra.title,
    'aria-disabled': !allowed || extra.disabled,
  });

  return { allowed, disabled: !allowed, title, props };
}
