import { useState } from 'react';
import { KnowledgeRetrieval, type KnowledgeSearchMode } from './KnowledgeRetrieval.js';
import type { PortalClient } from './portal.js';

// Access management explicitly opens Agent checks; ordinary tab entry starts
// with administrator inspection. Keep navigation state outside the panel so
// switching business tabs preserves the selected mode.
export function useKnowledgeDetailRetrieval(portal: PortalClient, baseId: string | null) {
  const [detailTab, setDetailTab] = useState('documents');
  const [mode, setMode] = useState<KnowledgeSearchMode>('library');
  return {
    detailTab,
    setDetailTab,
    panel: baseId ? (
      <KnowledgeRetrieval
        key={`retrieval:${baseId}`}
        portal={portal}
        baseId={baseId}
        mode={mode}
        onModeChange={setMode}
      />
    ) : null,
    openAgentCheck: () => {
      setMode('agent');
      setDetailTab('retrieval');
    },
  };
}
