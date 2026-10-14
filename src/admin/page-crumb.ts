import { createContext, useContext, useEffect } from 'react';

/**
 * Lets the routed page publish the object it is showing so the shell's single
 * breadcrumb can read `分区 / 对象名` (e.g. 企业管理后台 / 知识库 / whz-1).
 * The page owns the name because it is the only one that fetched it; the shell
 * owns the rendering because it is the only one that knows the section route.
 */
export const PageCrumbContext = createContext<(label: string | null) => void>(() => {});

/** Publish `label` while mounted; clears it again on unmount or label change. */
export function usePageCrumb(label: string | null): void {
  const setLabel = useContext(PageCrumbContext);
  useEffect(() => {
    setLabel(label);
    return () => setLabel(null);
  }, [label, setLabel]);
}
