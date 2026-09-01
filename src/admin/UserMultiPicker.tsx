import { Check, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { PlatformUser } from '@aep/sdk-node';
import { translate, type AdminLanguage } from './i18n.js';
import { Badge } from '../ui/components/ui/badge.js';
import { Button } from '../ui/components/ui/button.js';
import { FieldLabel } from '../ui/components/ui/field.js';
import { Input } from '../ui/components/ui/input.js';
import { cn } from '../ui/lib/utils.js';

const language: AdminLanguage = 'zh';

export function UserMultiPicker({ users, selected, onToggle, disabled = false }: {
  readonly users: readonly PlatformUser[];
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (userId: string) => void;
  readonly disabled?: boolean;
}) {
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return query ? users.filter(user => user.displayName.toLowerCase().includes(query) || user.username.toLowerCase().includes(query)) : users;
  }, [users, filter]);
  return (
    <>
      <FieldLabel>{translate(language, 'selectUsers')}</FieldLabel>
      <Input aria-label={translate(language, 'searchUsers')} value={filter} onChange={event => setFilter(event.target.value)} placeholder={translate(language, 'searchUsers')} disabled={disabled} />
      <div className="flex max-h-60 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-1">
        {filtered.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">{translate(language, 'noMatchingUsers')}</p> : filtered.map(user => (
          <Button key={user.id} type="button" variant="ghost" size="sm" role="checkbox" aria-checked={selected.has(user.id)} disabled={disabled} className="justify-between"
            onClick={() => onToggle(user.id)}
          >
            <span className="flex min-w-0 items-center gap-2"><UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0"><span className="block truncate text-left">{user.displayName}</span><span className="block truncate text-left text-xs text-muted-foreground">{user.username}</span></span></span>
            <span aria-hidden="true" className={cn('flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors', selected.has(user.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>{selected.has(user.id) ? <Check className="size-3" /> : null}</span>
          </Button>
        ))}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{translate(language, 'selectedUsersLabel')}<Badge variant="secondary">{selected.size}</Badge></p>
    </>
  );
}
