import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  wikijsRequest,
  renderResponse,
  extractMutationError,
  type WikiJsResponse,
} from "./wikijs.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function err(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/** Run a GraphQL operation, normalize result/error handling for an MCP tool. */
async function gql<T = unknown>(
  label: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<ToolResult> {
  let res: WikiJsResponse<T>;
  try {
    res = await wikijsRequest<T>(query, variables);
  } catch (e) {
    return err(`${label} failed: ${(e as Error).message}`);
  }
  if (!res.ok) {
    return err(`${label} -> HTTP ${res.status}\n${renderResponse(res)}`);
  }
  const mutationError = extractMutationError(res.data);
  if (mutationError) {
    return err(`${label}: ${mutationError}`);
  }
  return ok(renderResponse(res));
}

// ───────────────────────── GraphQL operations ─────────────────────────
// References: https://docs.requarks.io/dev/api

const Q_SEARCH_PAGES = /* GraphQL */ `
  query SearchPages($query: String!, $path: String, $locale: String) {
    pages {
      search(query: $query, path: $path, locale: $locale) {
        results { id title description path locale }
        suggestions
        totalHits
      }
    }
  }
`;

const Q_LIST_PAGES = /* GraphQL */ `
  query ListPages(
    $limit: Int
    $orderBy: PageOrderBy
    $orderByDirection: PageOrderByDirection
    $tags: [String!]
    $locale: String
    $creatorId: Int
    $authorId: Int
  ) {
    pages {
      list(
        limit: $limit
        orderBy: $orderBy
        orderByDirection: $orderByDirection
        tags: $tags
        locale: $locale
        creatorId: $creatorId
        authorId: $authorId
      ) {
        id path locale title description contentType
        isPublished isPrivate privateNS createdAt updatedAt tags
      }
    }
  }
`;

const Q_GET_PAGE_BY_ID = /* GraphQL */ `
  query GetPageById($id: Int!) {
    pages {
      single(id: $id) {
        id path hash title description
        isPrivate isPublished privateNS
        publishStartDate publishEndDate
        tags { id tag title }
        content render contentType
        createdAt updatedAt editor locale
        scriptCss scriptJs
        authorId authorName authorEmail
        creatorId creatorName creatorEmail
      }
    }
  }
`;

const Q_GET_PAGE_BY_PATH = /* GraphQL */ `
  query GetPageByPath($path: String!, $locale: String!) {
    pages {
      singleByPath(path: $path, locale: $locale) {
        id path hash title description
        isPrivate isPublished
        tags { id tag title }
        content render contentType
        createdAt updatedAt editor locale
        authorName authorEmail
      }
    }
  }
`;

const Q_LIST_PAGE_TAGS = /* GraphQL */ `
  query ListPageTags {
    pages {
      tags { id tag title createdAt updatedAt }
    }
  }
`;

const Q_PAGE_HISTORY = /* GraphQL */ `
  query PageHistory($id: Int!, $offsetPage: Int, $offsetSize: Int) {
    pages {
      history(id: $id, offsetPage: $offsetPage, offsetSize: $offsetSize) {
        trail {
          versionId versionDate authorId authorName actionType valueBefore valueAfter
        }
        total
      }
    }
  }
`;

const M_CREATE_PAGE = /* GraphQL */ `
  mutation CreatePage(
    $content: String!
    $description: String!
    $editor: String!
    $isPublished: Boolean!
    $isPrivate: Boolean!
    $locale: String!
    $path: String!
    $publishEndDate: Date
    $publishStartDate: Date
    $scriptCss: String
    $scriptJs: String
    $tags: [String]!
    $title: String!
  ) {
    pages {
      create(
        content: $content
        description: $description
        editor: $editor
        isPublished: $isPublished
        isPrivate: $isPrivate
        locale: $locale
        path: $path
        publishEndDate: $publishEndDate
        publishStartDate: $publishStartDate
        scriptCss: $scriptCss
        scriptJs: $scriptJs
        tags: $tags
        title: $title
      ) {
        responseResult { succeeded errorCode slug message }
        page { id path title }
      }
    }
  }
`;

const M_UPDATE_PAGE = /* GraphQL */ `
  mutation UpdatePage(
    $id: Int!
    $content: String
    $description: String
    $editor: String
    $isPublished: Boolean
    $isPrivate: Boolean
    $locale: String
    $path: String
    $publishEndDate: Date
    $publishStartDate: Date
    $scriptCss: String
    $scriptJs: String
    $tags: [String]
    $title: String
  ) {
    pages {
      update(
        id: $id
        content: $content
        description: $description
        editor: $editor
        isPublished: $isPublished
        isPrivate: $isPrivate
        locale: $locale
        path: $path
        publishEndDate: $publishEndDate
        publishStartDate: $publishStartDate
        scriptCss: $scriptCss
        scriptJs: $scriptJs
        tags: $tags
        title: $title
      ) {
        responseResult { succeeded errorCode slug message }
        page { id path title updatedAt }
      }
    }
  }
`;

const M_DELETE_PAGE = /* GraphQL */ `
  mutation DeletePage($id: Int!) {
    pages {
      delete(id: $id) {
        responseResult { succeeded errorCode slug message }
      }
    }
  }
`;

const M_RENDER_PAGE = /* GraphQL */ `
  mutation RenderPage($id: Int!) {
    pages {
      render(id: $id) {
        responseResult { succeeded errorCode slug message }
      }
    }
  }
`;

const Q_LIST_ASSETS = /* GraphQL */ `
  query ListAssets($folderId: Int!, $kind: AssetKind!) {
    assets {
      list(folderId: $folderId, kind: $kind) {
        id filename ext kind mime fileSize metadata createdAt updatedAt
        folder { id name slug }
        author { id name email }
      }
    }
  }
`;

const Q_LIST_ASSET_FOLDERS = /* GraphQL */ `
  query ListAssetFolders($parentFolderId: Int!) {
    assets {
      folders(parentFolderId: $parentFolderId) { id slug name }
    }
  }
`;

const Q_LIST_USERS = /* GraphQL */ `
  query ListUsers {
    users {
      list { id name email providerKey isSystem isActive createdAt lastLoginAt }
    }
  }
`;

const Q_SEARCH_USERS = /* GraphQL */ `
  query SearchUsers($query: String!) {
    users {
      search(query: $query) { id name email providerKey }
    }
  }
`;

const Q_GET_USER = /* GraphQL */ `
  query GetUser($id: Int!) {
    users {
      single(id: $id) {
        id name email providerKey providerName
        isSystem isActive isVerified
        location jobTitle timezone dateFormat appearance
        createdAt updatedAt lastLoginAt
        groups { id name }
      }
    }
  }
`;

const Q_SYSTEM_INFO = /* GraphQL */ `
  query SystemInfo {
    system {
      info {
        currentVersion latestVersion latestVersionReleaseDate
        operatingSystem hostname cpuCores ramTotal workingDirectory
        nodeVersion dbType dbVersion dbHost
      }
    }
  }
`;

// ───────────────────────── Zod input enums ─────────────────────────
const ORDER_BY = z.enum(["CREATED", "ID", "PATH", "TITLE", "UPDATED"]);
const ORDER_DIR = z.enum(["ASC", "DESC"]);
const EDITOR = z.enum(["markdown", "code", "html", "ckeditor"]);
const ASSET_KIND = z.enum(["ALL", "IMAGE", "BINARY"]);

export function registerTools(server: McpServer): void {
  // ───────────────────────── Search ─────────────────────────
  server.registerTool(
    "search_pages",
    {
      description:
        "Full-text search across Wiki.js page titles, descriptions, and content. " +
        "Use this first when looking for a page — IDs aren't guessable. " +
        "Returns ranked matches with id, title, path, locale, description.",
      inputSchema: {
        query: z.string().min(1).describe("Search keywords. Supports phrases."),
        path: z.string().optional().describe(
          "Optional path prefix to restrict the search (e.g. 'docs/').",
        ),
        locale: z.string().optional().describe(
          "Optional locale filter (e.g. 'en'). Defaults to all locales.",
        ),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, path, locale }) =>
      gql("search_pages", Q_SEARCH_PAGES, { query, path, locale }),
  );

  // ───────────────────────── Pages ─────────────────────────
  server.registerTool(
    "list_pages",
    {
      description:
        "List pages with optional filters (tag, locale, author). For finding a specific page, " +
        "prefer `search_pages` — `list_pages` is for browsing by attribute or paging through everything.",
      inputSchema: {
        limit: z.number().int().min(1).max(1000).default(50),
        orderBy: ORDER_BY.default("UPDATED"),
        orderByDirection: ORDER_DIR.default("DESC"),
        tags: z.array(z.string()).optional().describe(
          "Only include pages with all of these tags.",
        ),
        locale: z.string().optional(),
        creatorId: z.number().int().optional(),
        authorId: z.number().int().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => gql("list_pages", Q_LIST_PAGES, args),
  );

  server.registerTool(
    "get_page",
    {
      description:
        "Fetch a single page's full content. Provide either `id` (preferred) or `path` + `locale`. " +
        "Returns rendered HTML, markdown source, tags, metadata, and author info.",
      inputSchema: {
        id: z.number().int().optional().describe(
          "Numeric page ID. Get this from search_pages or list_pages.",
        ),
        path: z.string().optional().describe(
          "Page path, e.g. 'docs/getting-started'. Requires `locale`.",
        ),
        locale: z.string().optional().describe("Locale code, e.g. 'en'."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id, path, locale }) => {
      if (id !== undefined) {
        return gql("get_page", Q_GET_PAGE_BY_ID, { id });
      }
      if (path && locale) {
        return gql("get_page", Q_GET_PAGE_BY_PATH, { path, locale });
      }
      return err("get_page requires either `id`, or both `path` and `locale`.");
    },
  );

  server.registerTool(
    "list_page_tags",
    {
      description: "List every tag defined across the wiki.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => gql("list_page_tags", Q_LIST_PAGE_TAGS),
  );

  server.registerTool(
    "get_page_history",
    {
      description: "List edit history for a page. Paginated; returns version IDs, dates, and authors.",
      inputSchema: {
        id: z.number().int(),
        offsetPage: z.number().int().min(0).default(0),
        offsetSize: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => gql("get_page_history", Q_PAGE_HISTORY, args),
  );

  server.registerTool(
    "create_page",
    {
      description:
        "Create a new page. Path must be unique within the locale. " +
        "Use `update_page` to modify an existing page instead.",
      inputSchema: {
        path: z.string().min(1).describe(
          "Unique path within the locale, no leading slash, e.g. 'docs/setup'.",
        ),
        title: z.string().min(1),
        content: z.string().describe("Page body in the chosen editor's format."),
        description: z.string().default(""),
        editor: EDITOR.default("markdown"),
        locale: z.string().default("en"),
        tags: z.array(z.string()).default([]),
        isPublished: z.boolean().default(true),
        isPrivate: z.boolean().default(false),
        publishStartDate: z.string().optional().describe(
          "ISO date for scheduled publish, or omit for immediate.",
        ),
        publishEndDate: z.string().optional(),
        scriptCss: z.string().optional(),
        scriptJs: z.string().optional(),
      },
      annotations: { openWorldHint: true },
    },
    async (args) => gql("create_page", M_CREATE_PAGE, args),
  );

  server.registerTool(
    "update_page",
    {
      description:
        "Update fields on an existing page. Only provided fields are changed. " +
        "Get the page `id` from search_pages or list_pages. " +
        "Tags, if provided, REPLACE the existing tag set.",
      inputSchema: {
        id: z.number().int().describe("Numeric page ID."),
        title: z.string().optional(),
        content: z.string().optional(),
        description: z.string().optional(),
        editor: EDITOR.optional(),
        locale: z.string().optional(),
        path: z.string().optional(),
        tags: z.array(z.string()).optional(),
        isPublished: z.boolean().optional(),
        isPrivate: z.boolean().optional(),
        publishStartDate: z.string().optional(),
        publishEndDate: z.string().optional(),
        scriptCss: z.string().optional(),
        scriptJs: z.string().optional(),
      },
      annotations: { openWorldHint: true, idempotentHint: true },
    },
    async (args) => gql("update_page", M_UPDATE_PAGE, args),
  );

  server.registerTool(
    "delete_page",
    {
      description:
        "Permanently delete a page by ID. Cannot be undone — confirm with the user first.",
      inputSchema: { id: z.number().int() },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async ({ id }) => gql("delete_page", M_DELETE_PAGE, { id }),
  );

  server.registerTool(
    "render_page",
    {
      description:
        "Re-render a page's cached HTML output. Call after editing markup outside Wiki.js.",
      inputSchema: { id: z.number().int() },
      annotations: { openWorldHint: true, idempotentHint: true },
    },
    async ({ id }) => gql("render_page", M_RENDER_PAGE, { id }),
  );

  // ───────────────────────── Assets ─────────────────────────
  server.registerTool(
    "list_assets",
    {
      description:
        "List assets (uploaded files) in a Wiki.js folder. Folder 0 is the root. " +
        "Use `list_asset_folders` first to discover folder IDs.",
      inputSchema: {
        folderId: z.number().int().min(0).default(0).describe("Folder ID. 0 means root."),
        kind: ASSET_KIND.default("ALL").describe(
          "Filter by asset kind. IMAGE returns just images.",
        ),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ folderId, kind }) => gql("list_assets", Q_LIST_ASSETS, { folderId, kind }),
  );

  server.registerTool(
    "list_asset_folders",
    {
      description:
        "List sub-folders within an asset folder. Walk the tree by calling with the returned folder IDs.",
      inputSchema: {
        parentFolderId: z.number().int().min(0).default(0).describe(
          "Parent folder ID. 0 means root.",
        ),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ parentFolderId }) =>
      gql("list_asset_folders", Q_LIST_ASSET_FOLDERS, { parentFolderId }),
  );

  // ───────────────────────── Users ─────────────────────────
  server.registerTool(
    "list_users",
    {
      description:
        "List all Wiki.js users (requires admin scope on the API key). " +
        "For finding a specific user, prefer `search_users`.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => gql("list_users", Q_LIST_USERS),
  );

  server.registerTool(
    "search_users",
    {
      description: "Search users by name or email substring. Returns id, name, email, providerKey.",
      inputSchema: {
        query: z.string().min(1).describe("Substring to match name or email."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query }) => gql("search_users", Q_SEARCH_USERS, { query }),
  );

  server.registerTool(
    "get_user",
    {
      description: "Fetch a user's full profile by ID, including group membership.",
      inputSchema: { id: z.number().int() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id }) => gql("get_user", Q_GET_USER, { id }),
  );

  // ───────────────────────── System ─────────────────────────
  server.registerTool(
    "get_system_info",
    {
      description:
        "Return Wiki.js instance info: version, host, runtime, database type/version. " +
        "Useful when the user asks 'what version am I running' or for debugging.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => gql("get_system_info", Q_SYSTEM_INFO),
  );
}
