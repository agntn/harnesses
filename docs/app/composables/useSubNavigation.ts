import type { ContentNavigationItem } from "@nuxt/content";
import { HARNESSES } from "../utils/harnesses";

const NAV_ICONS: Record<string, string> = {
  "/guide": "i-solar-book-2-linear",
  "/guide/registry": "i-solar-map-point-linear",
  "/guide/invoke": "i-solar-play-circle-linear",
  "/guide/mcp-servers": "i-solar-server-linear",
  "/guide/agents-sync": "i-solar-link-linear",
  "/guide/cli": "i-solar-code-square-linear",
  "/guide/agents": "i-solar-bot-linear",
  "/guide/sessions": "i-solar-document-text-linear",
  "/guide/custom": "i-solar-add-circle-linear",
  "/guide/explorer": "i-solar-tuning-2-linear",
  "/harnesses": "i-solar-library-linear",
  "/explorer": "i-solar-tuning-2-linear",
  ...Object.fromEntries(HARNESSES.map((harness) => [harness.to, harness.icon])),
};

export function getFirstPagePath(item: ContentNavigationItem): string {
  let current = item;
  while (current.children?.length) {
    current = current.children[0]!;
  }
  return current.path;
}

function withIcons(items: ContentNavigationItem[]): ContentNavigationItem[] {
  return items.map((item) => ({
    ...item,
    icon: NAV_ICONS[item.path] ?? item.icon,
    /** Leaf pages match exactly, so /guide is not highlighted together with /guide/cli. */
    exact: !item.children?.length,
    children: item.children ? withIcons(item.children) : item.children,
  }));
}

export function useSubNavigation(
  providedNavigation?: Ref<ContentNavigationItem[] | null | undefined>,
) {
  const route = useRoute();
  const appConfig = useAppConfig();
  const navigation = providedNavigation ?? inject<Ref<ContentNavigationItem[]>>("navigation");

  const isDocsPage = computed(() => route.meta.layout === "docs");

  const subNavigationMode = computed(() => {
    if (!isDocsPage.value) return undefined;
    return (appConfig.navigation as { sub?: "header" | "aside" } | undefined)?.sub;
  });

  const currentSection = computed(() => {
    if (!subNavigationMode.value || !navigation?.value) return undefined;
    return navigation.value.find(
      (item) => route.path === item.path || route.path.startsWith(`${item.path}/`),
    );
  });

  const sections = computed(() => {
    if (!subNavigationMode.value || !navigation?.value) return [];
    return navigation.value
      .filter((item) => item.children?.length)
      .map((item) => ({
        label: item.title,
        icon: (NAV_ICONS[item.path] ?? item.icon) as string | undefined,
        to: getFirstPagePath(item),
        active: route.path === item.path || route.path.startsWith(`${item.path}/`),
      }));
  });

  const sidebarNavigation = computed(() => {
    const items =
      subNavigationMode.value && currentSection.value
        ? currentSection.value.children || []
        : navigation?.value || [];
    return withIcons(items);
  });

  return {
    subNavigationMode,
    sections,
    currentSection,
    sidebarNavigation,
  };
}
