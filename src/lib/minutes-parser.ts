import type { Heading, Nodes } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { toString } from "mdast-util-to-string";
import { gfm } from "micromark-extension-gfm";
import { CONTINUE, visit } from "unist-util-visit";
import { setDefault } from "./util";

/** Identifies the type of section that a heading introduces. */
type Section = {
  /** A breakout or plenary session will have attendance and reviews inside it. */
  session?: string;
  /** A design review section has discussion notes and possibly a proposed comment inside it. */
  review?: URL;
  /** The index in the parent's children at which this section starts. */
  startIndex: number;
};
function classifyHeading(heading: Heading, index: number): Section {
  const section: Section = { startIndex: index };
  visit(heading, ["text", "link"], (node) => {
    if (node.type === "text") {
      const text = node;
      const breakoutMatch = text.value.match(/Breakout \p{Letter}\b/iv)?.[0];
      if (breakoutMatch) {
        section.session = breakoutMatch;
      }
      if (/Plenary/i.test(text.value)) {
        section.session = "Plenary";
      }
    }
    if (node.type === "link") {
      const link = node;
      if (/github.com\/w3ctag\/(?<repo>[^/]+)\/(pull|issues)\/(?<number>\d+)/i.test(link.url)) {
        try {
          section.review = new URL(link.url);
        } catch {
          // On invalid URLs, don't attach the review.
        }
      }
    }
    return CONTINUE;
  });
  return section;
}

/** Finds a "Present:" text node in nodes between startIndex and the next heading. */
function findAttendance(
  nodes: Nodes[],
  startIndex: number,
): { nextIndex: number; attendance: string[] } {
  for (let index = startIndex; index < nodes.length; index++) {
    const child = nodes[index];
    if (child.type === "heading") {
      // No "Present:" block before the next heading.
      return { nextIndex: index - 1, attendance: [] };
    }
    if (child.type === "paragraph") {
      const text = toString(child);
      const presentMatch = /Present:(?<attendees>[^\n]+)/.exec(text);
      if (presentMatch?.groups) {
        return {
          nextIndex: index,
          attendance: presentMatch.groups.attendees
            .split(/[\p{Punctuation}+]| and /v)
            .map((name) => name.trim())
            .filter((name) => name !== ""),
        };
      }
    }
  }
  // Didn't find anything, so the outer loop is also finished.
  return { nextIndex: nodes.length, attendance: [] };
}

function nextHeadingIndex(
  children: Nodes[],
  startHeading: Heading,
  index: number,
): number {
  for (; index < children.length; index++) {
    const child = children[index];
    if (child.type === "heading" && child.depth <= startHeading.depth) {
      return index;
    }
  }
  return index;
}

function gatherBlockquoteSources(
  nodes: Nodes[],
  start: number,
  end: number,
  source: (
    start: number | undefined,
    end: number | undefined,
  ) => string | undefined,
): string[] {
  const result: string[] = [];
  for (let index = start; index <= end; index++) {
    const child = nodes[index];
    if (child.type === "html" && child.value.startsWith("<blockquote>")) {
      const quoteStart = index;
      for (; index <= end; index++) {
        const child = nodes[index];
        if (child.type === "html" && child.value.endsWith("</blockquote>")) {
          const htmlStart = nodes[quoteStart].position?.start.offset;
          const htmlEnd = nodes[index].position?.end.offset;
          if (htmlStart !== undefined && htmlEnd !== undefined) {
            const content = source(
              htmlStart + "<blockquote>".length,
              htmlEnd - "</blockquote>".length,
            )?.trim();
            if (content && content.length > 0) {
              result.push(content);
            }
          }
          break;
        }
      }
    }
  }
  return result;
}

export type Minutes = {
  // A map from "session" ("Breakout A/B/C" or "Plenary") to the list of names in the "Present"
  // lists.
  attendance: { [session: string]: string[] };
  discussion: {
    // Each design review can be discussed multiple times in a week, and each discussion can propose
    // multiple comments to post to the issue.
    [designReviewUrl: string]:
      | undefined
      | {
          content: string;
          proposedComments: string[];
        }[];
  };
};

export function parseMinutes(minutes: string): Minutes {
  const tree = fromMarkdown(minutes, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });

  function source(
    start: number | undefined,
    end: number | undefined,
  ): string | undefined {
    if (start === undefined || end === undefined) return undefined;
    return minutes.slice(start, end);
  }

  const result: Minutes = { attendance: {}, discussion: {} };

  for (let index = 0; index < tree.children.length; index++) {
    const child = tree.children[index];
    if (child.type === "heading") {
      const heading = child;

      const section = classifyHeading(heading, index);
      if (section.session) {
        const { nextIndex, attendance } = findAttendance(
          tree.children,
          index + 1,
        );
        index = nextIndex;
        setDefault(result.attendance, section.session, []).push(...attendance);
        continue;
      }
      if (section.review) {
        const sectionStart = index + 1;
        const sectionEnd =
          nextHeadingIndex(tree.children, heading, sectionStart) - 1;
        if (sectionStart <= sectionEnd) {
          const content = source(
            tree.children[sectionStart].position?.start.offset,
            tree.children[sectionEnd].position?.end.offset,
          );
          if (content && content.length > 0) {
            if (!result.discussion[section.review.href]) {
              result.discussion[section.review.href] = [];
            }
            result.discussion[section.review.href]!.push({
              content,
              proposedComments: gatherBlockquoteSources(
                tree.children,
                sectionStart,
                sectionEnd,
                source,
              ),
            });
          }
        }
        index = sectionEnd;
        continue;
      }
    }
  }

  return result;
}
