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
                  <TableHead>{translate(language, "memoryAdminUser")}</TableHead>
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
                      <TableCell>{account.adminUser || "—"}</TableCell>
                      <TableCell>{account.createdAt || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            {translate(language, "memoryHint")}
          </p>
        </div>
      ) : null}
    </section>
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
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <HealthBadge healthy={status.healthy} />
            <span className="text-muted-foreground">
              {status.configured
                ? status.url
                : translate(language, "knowledgeNotConfigured")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {translate(language, "knowledgeHint")}
          </p>
        </div>
      ) : null}
    </section>
  );
}
