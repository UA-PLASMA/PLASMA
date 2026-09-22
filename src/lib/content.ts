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
  "phd",
  "masters",
  "undergraduate",
] as const;

export type MemberPosition = (typeof memberPositions)[number];

export interface Member {
  slug: string;
  title: string;
  bio: string;
  position: MemberPosition;
  alumni: boolean;
  joinYear: number;
  leaveYear: number;
  orcid?: string;
  email?: string;
  linkedin?: string;
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
  etAl: boolean;
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

function getOptionalNumber(source: TomlRecord, key: string, sourceName: string): number | undefined {
  const value = source[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number") {
    throw new Error(`Expected "${key}" to be a number in ${sourceName}.`);
  }

  return value;
}

function getBoolean(
  source: TomlRecord,
  key: string,
  sourceName: string,
  required = true,
): boolean | undefined {
  const value = source[key];

  if (typeof value === "boolean") {
    return value;
  }

  if (!required && value === undefined) {
    return undefined;
  }

  throw new Error(`Expected "${key}" to be a boolean in ${sourceName}.`);
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

      const alumni = getBoolean(value, "alumni", sourceName, false) ?? false;
      const leaveYear = getOptionalNumber(value, "leave_year", sourceName);

      if (alumni && leaveYear === undefined) {
        throw new Error(`Expected "leave_year" in ${sourceName} when "alumni" is true.`);
      }

      if (alumni && position === "PI") {
        throw new Error(`A PI cannot be marked as an alumnus in ${sourceName}.`);
      }

      const name = getRecord(value, "name", sourceName);
      const skipHighestDegree = alumni && (position === "scientist" || position === "postdoc");
      const optionalUndergraduateDegree =
        position === "undergraduate" && value.highest_degree === undefined;
      const highestDegree = skipHighestDegree || optionalUndergraduateDegree
        ? { degree: "", from: "", year: 0 }
        : (() => {
            const degree = getRecord(value, "highest_degree", sourceName);

            return {
              degree: getString(degree, "degree", sourceName) ?? "",
              from: getString(degree, "from", sourceName) ?? "",
              year: getNumber(degree, "year", sourceName),
            };
          })();

      return {
        slug,
        title: getString(value, "title", sourceName) ?? "",
        bio: getString(value, "bio", sourceName) ?? "",
        position: position as MemberPosition,
        alumni,
        joinYear: getNumber(value, "join_year", sourceName),
        leaveYear: leaveYear ?? 0,
        orcid: getString(value, "orcid", sourceName, false),
        email: getString(value, "email", sourceName, false),
        linkedin: getString(value, "linkedin", sourceName, false),
        name: {
          first: getString(name, "first", sourceName) ?? "",
          last: getString(name, "last", sourceName) ?? "",
        },
        highestDegree,
        image: findAsset("media/members", slug, ["jpg", "png"]),
      };
    })
    .sort((first, second) => {
      const positionOrder = memberPositions.indexOf(first.position) - memberPositions.indexOf(second.position);
      const joinYearOrder =
        (first.joinYear || Number.MAX_SAFE_INTEGER) - (second.joinYear || Number.MAX_SAFE_INTEGER);
      return positionOrder || joinYearOrder || first.name.last.localeCompare(second.name.last);
    });
}

function loadPapers(memberList: readonly Member[]): Paper[] {
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
        etAl: getBoolean(value, "et_al", sourceName, false) ?? false,
        authors: authors.map((author, index) => {
          if (!isRecord(author)) {
            throw new Error(`Expected author ${index + 1} to be a table in ${sourceName}.`);
          }

          const card = getString(author, "card", sourceName, false);

          if (card) {
            const member = memberList.find((entry) => entry.slug === card);

            if (!member) {
              throw new Error(`Unknown author card "${card}" in ${sourceName}.`);
            }

            return {
              first: member.name.first,
              last: member.name.last,
              card,
            };
          }

          return {
            first: getString(author, "first", sourceName) ?? "",
            last: getString(author, "last", sourceName) ?? "",
            card,
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
export const papers = loadPapers(members);
export const news = loadNews();
export const announcements = loadAnnouncements();
