import { UserRound } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import type { PlatformUser } from '@aep/sdk-node';
import { translate, type AdminLanguage } from './i18n.js';
import { Badge } from '../ui/components/ui/badge.js';
import { Checkbox } from '../ui/components/ui/checkbox.js';
import { FieldLabel } from '../ui/components/ui/field.js';
import { Input } from '../ui/components/ui/input.js';

const language: AdminLanguage = 'zh';

export function UserMultiPicker({ users, selected, onToggle, disabled = false }: {
  readonly users: readonly PlatformUser[];
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (userId: string) => void;
  readonly disabled?: boolean;
}) {
  const listId = useId();
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
        {filtered.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">{translate(language, 'noMatchingUsers')}</p> : filtered.map((user, index) => {
          const checkboxId = `${listId}-user-${index}`;
          return (
            <div key={user.id} className="flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted">
              <Checkbox id={checkboxId} checked={selected.has(user.id)} onCheckedChange={() => onToggle(user.id)} disabled={disabled} />
              <FieldLabel htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer font-normal">
                <span className="flex min-w-0 items-center gap-2">
                  <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-left">{user.displayName}</span>
                    <span className="block truncate text-left text-xs text-tertiary-foreground">{user.username}</span>
                  </span>
                </span>
              </FieldLabel>
            </div>
          );
        })}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-tertiary-foreground">{translate(language, 'selectedUsersLabel')}<Badge variant="secondary">{selected.size}</Badge></p>
    </>
  );
}
