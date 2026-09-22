import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";

const projectRoot = process.cwd();
const configRoot = join(projectRoot, "assets", "config");
const assetsRoot = join(projectRoot, "assets");

const memberPositions = [
  "PI",
  "scientist",
  "postdoc",
  "graduate",
  "undergraduate",
  "alumni",
] as const;

export type MemberPosition = (typeof memberPositions)[number];

export interface Member {
  slug: string;
  title: string;
  bio: string;
  position: MemberPosition;
  orcid?: string;
  name: {
    first: string;
    last: string;
  };
  highestDegree: {
    degree: string;
    from: string;
    year: number;
  };
  image?: string;
}

export interface PaperAuthor {
  first: string;
  last: string;
  card?: string;
}

export interface Paper {
  slug: string;
  title: string;
  doi: string;
  journal: string;
  date: string;
  authors: PaperAuthor[];
  highlightImage?: string;
  pdf?: string;
}

export interface NewsArticle {
  slug: string;
  title: string;
  body: string;
  date: string;
  media?: string;
}

export interface Announcement {
  slug: string;
  text: string;
  link: {
    url: string;
    internal: boolean;
  };
  dates: {
    start: string;
    end: string;
  };
}

type TomlRecord = Record<string, unknown>;

function isRecord(value: unknown): value is TomlRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(
  source: TomlRecord,
  key: string,
  sourceName: string,
  required = true,
): string | undefined {
  const value = source[key];

  if (typeof value === "string") {
    return value;
  }

  if (!required && (value === undefined || value === "")) {
    return undefined;
  }

  throw new Error(`Expected "${key}" to be a string in ${sourceName}.`);
}

function getRecord(source: TomlRecord, key: string, sourceName: string): TomlRecord {
  const value = source[key];

  if (!isRecord(value)) {
    throw new Error(`Expected "${key}" to be a table in ${sourceName}.`);
  }

  return value;
}

function getNumber(source: TomlRecord, key: string, sourceName: string): number {
  const value = source[key];

  if (typeof value !== "number") {
    throw new Error(`Expected "${key}" to be a number in ${sourceName}.`);
  }

  return value;
}

function getDate(source: TomlRecord, key: string, sourceName: string): string {
  const value = source[key];
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error(`Expected "${key}" to be an ISO date in ${sourceName}.`);
  }

  return date;
}

function getTomlEntries(
  collection: string,
): Array<{ slug: string; sourceName: string; value: TomlRecord }> {
  const directory = join(configRoot, collection);

  if (!existsSync(directory)) {
    throw new Error(`Missing required content directory: ${directory}`);
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".toml") && !entry.name.startsWith("_"))
    .sort((first, second) => first.name.localeCompare(second.name))
    .map((entry) => {
      const sourceName = join("assets", "config", collection, entry.name);
      const content = readFileSync(join(directory, entry.name), "utf8");

      try {
        const value = parse(content);

        if (!isRecord(value)) {
          throw new Error("The TOML file does not contain a top-level table.");
        }

        return {
          slug: entry.name.replace(/\.toml$/, ""),
          sourceName,
          value,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to read ${sourceName}: ${message}`);
      }
    });
}

function findAsset(
  directory: string,
  slug: string,
  extensions: readonly string[],
): string | undefined {
  for (const extension of extensions) {
    const fileName = `${slug}.${extension}`;

    if (existsSync(join(assetsRoot, directory, fileName))) {
      return `/${directory}/${fileName}`;
    }
  }

  return undefined;
}

function loadMembers(): Member[] {
  return getTomlEntries("members")
    .map(({ slug, sourceName, value }) => {
      const position = getString(value, "position", sourceName);

      if (!memberPositions.includes(position as MemberPosition)) {
        throw new Error(
          `Expected "position" in ${sourceName} to be one of: ${memberPositions.join(", ")}.`,
        );
      }

      const name = getRecord(value, "name", sourceName);
      const highestDegree = getRecord(value, "highest_degree", sourceName);

      return {
        slug,
        title: getString(value, "title", sourceName) ?? "",
        bio: getString(value, "bio", sourceName) ?? "",
        position: position as MemberPosition,
        orcid: getString(value, "orcid", sourceName, false),
        name: {
          first: getString(name, "first", sourceName) ?? "",
          last: getString(name, "last", sourceName) ?? "",
        },
        highestDegree: {
          degree: getString(highestDegree, "degree", sourceName) ?? "",
          from: getString(highestDegree, "from", sourceName) ?? "",
          year: getNumber(highestDegree, "year", sourceName),
        },
        image: findAsset("media/members", slug, ["jpg", "png"]),
      };
    })
    .sort((first, second) => {
      const positionOrder = memberPositions.indexOf(first.position) - memberPositions.indexOf(second.position);
      return positionOrder || first.name.last.localeCompare(second.name.last);
    });
}

function loadPapers(): Paper[] {
  return getTomlEntries("papers")
    .map(({ slug, sourceName, value }) => {
      const authors = value.authors;

      if (!Array.isArray(authors)) {
        throw new Error(`Expected "authors" to be an array in ${sourceName}.`);
      }

      return {
        slug,
        title: getString(value, "title", sourceName) ?? "",
        doi: getString(value, "doi", sourceName) ?? "",
        journal: getString(value, "journal", sourceName) ?? "",
        date: getDate(value, "date", sourceName),
        authors: authors.map((author, index) => {
          if (!isRecord(author)) {
            throw new Error(`Expected author ${index + 1} to be a table in ${sourceName}.`);
          }

          return {
            first: getString(author, "first", sourceName) ?? "",
            last: getString(author, "last", sourceName) ?? "",
            card: getString(author, "card", sourceName, false),
          };
        }),
        highlightImage: findAsset("media/papers", slug, ["jpg", "png"]),
        pdf: findAsset("files/papers", slug, ["pdf"]),
      };
    })
    .sort((first, second) => second.date.localeCompare(first.date));
}

function loadNews(): NewsArticle[] {
  return getTomlEntries("news")
    .map(({ slug, sourceName, value }) => ({
      slug,
      title: getString(value, "title", sourceName) ?? "",
      body: getString(value, "body", sourceName) ?? "",
      date: getDate(value, "date", sourceName),
      media: findAsset("media/news", slug, ["jpg", "png", "gif", "mp4"]),
    }))
    .sort((first, second) => second.date.localeCompare(first.date));
}

function loadAnnouncements(): Announcement[] {
  return getTomlEntries("announcements")
    .map(({ slug, sourceName, value }) => {
      const link = getRecord(value, "link", sourceName);
      const dates = getRecord(value, "dates", sourceName);
      const internal = link.internal;

      if (typeof internal !== "boolean") {
        throw new Error(`Expected "link.internal" to be a boolean in ${sourceName}.`);
      }

      return {
        slug,
        text: getString(value, "text", sourceName) ?? "",
        link: {
          url: getString(link, "url", sourceName) ?? "",
          internal,
        },
        dates: {
          start: getDate(dates, "start", sourceName),
          end: getDate(dates, "end", sourceName),
        },
      };
    })
    .sort((first, second) => second.dates.start.localeCompare(first.dates.start));
}

export const members = loadMembers();
export const papers = loadPapers();
export const news = loadNews();
export const announcements = loadAnnouncements();
