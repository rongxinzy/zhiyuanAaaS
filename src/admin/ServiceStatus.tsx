import { useEffect, useState } from "react";

import { Badge } from "../ui/components/ui/badge.js";
import { Button } from "../ui/components/ui/button.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/components/ui/table.js";

import { AdminConsoleClient } from "./client.js";
import { translate } from "./i18n.js";
import {
  PortalClient,
  type PortalKnowledgeStatus,
  type PortalMemorySearchResult,
  type PortalMemoryStatus,
} from "./portal.js";

const language = "zh" as const;

type TranslationKey = Parameters<typeof translate>[1];

function StatusHeader({
  titleKey,
  descriptionKey,
  onRefresh,
}: {
  readonly titleKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  readonly onRefresh: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs text-tertiary-foreground">
          {translate(language, "workspaceLabel")}
        </p>
        <h2 className="mt-1 text-lg font-semibold leading-snug">
          {translate(language, titleKey)}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {translate(language, descriptionKey)}
        </p>
      </div>
      <Button onClick={onRefresh}>
        {translate(language, "statusRefresh")}
      </Button>
    </div>
  );
}

function HealthBadge({ healthy }: { readonly healthy: boolean }) {
  return healthy ? (
    <Badge>{translate(language, "statusHealthy")}</Badge>
  ) : (
    <Badge variant="destructive">
      {translate(language, "statusUnhealthy")}
    </Badge>
  );
}

export function MemoryView({
  client,
  portal,
}: {
  readonly client: AdminConsoleClient;
  /** Test seam: injected portal helpers (defaults to a bearer client). */
  readonly portal?: PortalClient | undefined;
}) {
  const [resolvedPortal] = useState(
    () => portal ?? new PortalClient(() => client.getAccessToken()),
  );
  const [status, setStatus] = useState<PortalMemoryStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await resolvedPortal.memoryStatus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedPortal]);

  return (
    <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6">
      <StatusHeader
        titleKey="memory"
        descriptionKey="memoryDescription"
        onRefresh={() => void load()}
      />
      {error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : loading && !status ? (
        <p className="text-sm text-muted-foreground">
          {translate(language, "statusLoading")}
        </p>
      ) : status ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <HealthBadge healthy={status.healthy} />
            <span className="text-muted-foreground">{status.server}</span>
            <span>
              {translate(language, "memoryAccount")}:{" "}
              <span className="font-medium">{status.account}</span>
            </span>
          </div>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{translate(language, "memoryAccountID")}</TableHead>
                  <TableHead>{translate(language, "memoryUsers")}</TableHead>
                  <TableHead>{translate(language, "memoryCreatedAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      {translate(language, "memoryNoAccounts")}
                    </TableCell>
                  </TableRow>
                ) : (
                  status.accounts.map((account) => (
                    <TableRow key={account.accountID}>
                      <TableCell className="font-medium">
                        {account.accountID}
                      </TableCell>
                      <TableCell>
                        {account.userCount} {translate(language, "memoryUsers")}
                      </TableCell>
                      <TableCell>{account.createdAt || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">
              {translate(language, "memoryEmployees")}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{translate(language, "memoryColumnEmployee")}</TableHead>
                  <TableHead>{translate(language, "memoryColumnUser")}</TableHead>
                  <TableHead>{translate(language, "memoryColumnSessions")}</TableHead>
                  <TableHead>{translate(language, "memoryColumnLastActive")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      {translate(language, "memoryNoAccounts")}
                    </TableCell>
                  </TableRow>
                ) : (
                  status.employees.map((employee) => (
                    <TableRow key={employee.name}>
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      <TableCell>{employee.memoryUser}</TableCell>
                      <TableCell>{employee.sessions ?? "—"}</TableCell>
                      <TableCell>{employee.lastActive || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <MemorySearchBox portal={resolvedPortal} employees={status.employees.map((e) => e.name)} />
          <p className="text-xs text-muted-foreground">
            {translate(language, "memoryHint")}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function MemorySearchBox({
  portal,
  employees,
}: {
  readonly portal: PortalClient;
  readonly employees: readonly string[];
}) {
  const [employee, setEmployee] = useState(employees[0] ?? "");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PortalMemorySearchResult["memories"] | null>(null);

  const run = async () => {
    if (!employee || !query.trim()) return;
    setPending(true);
    setError(null);
    try {
      const out = await portal.memorySearch(employee, query.trim());
      setResults(out.memories);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setResults(null);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="text-sm font-medium">
        {translate(language, "memorySearchTitle")}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          value={employee}
          onChange={(event) => setEmployee(event.target.value)}
        >
          {employees.length === 0 ? (
            <option value="">{translate(language, "memorySearchSelectEmployee")}</option>
          ) : (
            employees.map((name) => <option key={name} value={name}>{name}</option>)
          )}
        </select>
        <input
          className="min-w-56 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          placeholder={translate(language, "memorySearchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void run();
          }}
        />
        <Button onClick={() => void run()} disabled={pending || !employee || !query.trim()}>
          {translate(language, "memorySearchButton")}
        </Button>
      </div>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {results ? (
        results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate(language, "memorySearchNoResults")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {results.map((memory) => (
              <li key={memory.uri} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{memory.uri}</span>
                  <span className="text-xs">{memory.score.toFixed(2)}</span>
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap">{memory.abstract}</p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

export function KnowledgeView({
  client,
  portal,
}: {
  readonly client: AdminConsoleClient;
  /** Test seam: injected portal helpers (defaults to a bearer client). */
  readonly portal?: PortalClient | undefined;
}) {
  const [resolvedPortal] = useState(
    () => portal ?? new PortalClient(() => client.getAccessToken()),
  );
  const [status, setStatus] = useState<PortalKnowledgeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await resolvedPortal.knowledgeStatus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedPortal]);

  return (
    <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6">
      <StatusHeader
        titleKey="knowledge"
        descriptionKey="knowledgeDescription"
        onRefresh={() => void load()}
      />
      {error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : loading && !status ? (
        <p className="text-sm text-muted-foreground">
          {translate(language, "statusLoading")}
        </p>
      ) : status ? (
        <div className="flex flex-col gap-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <HealthBadge healthy={status.healthy} />
            <span className="text-muted-foreground">
              {status.configured
                ? status.url
                : translate(language, "knowledgeNotConfigured")}
            </span>
          </div>
          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">
              {translate(language, "knowledgeBases")}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{translate(language, "knowledgeColumnName")}</TableHead>
                  <TableHead>{translate(language, "knowledgeColumnDocs")}</TableHead>
                  <TableHead>{translate(language, "memoryCreatedAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.knowledgeBases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      {translate(language, "knowledgeNoBases")}
                    </TableCell>
                  </TableRow>
                ) : (
                  status.knowledgeBases.map((kb) => (
                    <TableRow key={kb.id}>
                      <TableCell>
                        <div className="font-medium">{kb.name}</div>
                        {kb.description ? (
                          <div className="text-xs text-muted-foreground">{kb.description}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>{kb.documentCount ?? "—"}</TableCell>
                      <TableCell>{kb.createdAt || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            {translate(language, "knowledgeHint")}
          </p>
        </div>
      ) : null}
    </section>
  );
}
