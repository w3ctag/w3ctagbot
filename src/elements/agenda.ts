import { Temporal } from "@js-temporal/polyfill";
import { LitElement, css, html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import type { IssueSearchQuery } from "../gql/graphql";

function utcDate(dateInit: string | Date) {
  const date = new Date(dateInit);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
function mondayBefore(dateInit: string | Date) {
  const date = new Date(dateInit);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date;
}
function dateURL(date: Date) {
  return date.toISOString().slice(0, 19).replace(/[-:]/g, "");
}
function printTime(date: Date, timeZone: string, locale: string) {
  return date.toLocaleString(locale, {
    timeZone: timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    hour12: false,
    minute: "numeric",
    timeZoneName: "short",
  });
}

type SearchResult = NonNullable<
  NonNullable<IssueSearchQuery["search"]["nodes"]>[0]
>;

const wedMornPlenaryHours = 2 * 24 + 6;
const thurAftPlenaryHours = 3 * 24 + 13;

@customElement("tag-agenda")
export class TagAgenda extends LitElement {
  static styles = css`
    * {
      box-sizing: border-box;
    }

    :host {
      display: grid;
      grid-template: repeat(7, max-content) 1fr / max-content 1fr;
      grid-gap: 1em;
      flex-direction: column;
      margin: 0;
      padding: 3em;
      font-family: Sans-Serif;
    }

    input {
      height: 2em;
    }

    label {
      text-align: right;
      line-height: 2em;
    }

    textarea {
      grid-column: span 2;
    }
  `;

  @property({ type: Array })
  agendaPRs: SearchResult[] = [];
  @property({ type: Array })
  agendaIssues: SearchResult[] = [];
  @property({ type: Array })
  pendingPRs: SearchResult[] = [];
  @property({ type: Array })
  openReviews: SearchResult[] = [];

  @state()
  private _weekOf: Date = mondayBefore(
    new Date(Temporal.Now.plainDateISO().add({ days: 5 }).toString()),
  );

  @state()
  private _year: number = this._weekOf.getUTCFullYear();

  @state()
  private _plenaryHours: number = wedMornPlenaryHours;

  @state()
  private _filename: string = "";

  @state()
  private _fileContents: string = "";

  @query("#contents")
  private _contentsTextArea: HTMLTextAreaElement | undefined;

  private _plenaryChange(e: Event & { target: HTMLSelectElement }) {
    this._plenaryHours = parseInt(e.target.value);
  }

  private _dateChange(e: Event & { target: HTMLInputElement }) {
    if (e.target.valueAsDate) {
      this._weekOf = mondayBefore(e.target.valueAsDate);
    }
  }

  private _callTimes() {
    const monday = this._weekOf;
    if (monday < new Date("2025-04-06")) {
      const breakoutA = new Date(monday);
      breakoutA.setUTCHours(17); // 17:30 Mon GMT
      breakoutA.setUTCMinutes(30); //
      const breakoutB = new Date(monday);
      breakoutB.setUTCHours(47); // 22:00 Tue GMT
      const breakoutC = new Date(monday);
      breakoutC.setUTCHours(56); // 08:00 Wed GMT
      const plenary = new Date(monday);
      plenary.setUTCHours(this._plenaryHours < 24 * 3 ? 79 : 69); // 22:00 Wednesday GMT / 0600 Thursday GMT

      return [
        { time: breakoutA, label: "Breakout A (California / Europe)" },
        { time: breakoutB, label: "Breakout B (California / Australia)" },
        { time: breakoutC, label: "Breakout C (Europe / China)" },
        { time: plenary, label: "Plenary Session" },
      ];
    }
    const breakoutA = new Date(monday);
    breakoutA.setUTCHours(24 + 3); // 03:00 Tue GMT
    const breakoutB = new Date(monday);
    breakoutB.setUTCHours(24 * 2 + 17); // 17:00 Wed GMT
    const breakoutC = new Date(monday);
    breakoutC.setUTCHours(24 * 3 + 9); // 09:00 Thu GMT
    const plenary = new Date(monday);
    plenary.setUTCHours(this._plenaryHours);

    return [
      {
        time: breakoutA,
        label: "Breakout A (Asia / Australia / West America)",
      },
      { time: breakoutB, label: "Breakout B (America / Europe)" },
      { time: breakoutC, label: "Breakout C (Europe / Asia / Australia)" },
      { time: plenary, label: "Plenary Session" },
    ];
  }

  protected willUpdate(): void {
    const monday = this._weekOf;
    this._year = monday.getUTCFullYear();
    const calls = this._callTimes();
    this._filename = `${monday.toISOString().slice(5, 10)}-agenda.md`;
    const minutesFilename = `${monday.toISOString().slice(5, 10)}-minutes.md`;

    const shownIssues = new Set<string>(); // Holds graphql node IDs.
    function isUnshownIssueOrPR(
      elem: SearchResult,
    ): elem is SearchResult & { __typename: "Issue" | "PullRequest" } {
      if (shownIssues.has(elem.id)) return false;
      shownIssues.add(elem.id);
      return elem.__typename === "Issue" || elem.__typename === "PullRequest";
    }

    function renderIssue(
      issue: SearchResult & { __typename: "Issue" | "PullRequest" },
    ) {
      let result = `* [${issue.repository.name}#${issue.number}: ${issue.title}](${issue.url})`;
      const associated = [];
      if (issue.__typename === "PullRequest" && issue.author) {
        associated.push(issue.author.login);
      }
      for (const assignee of issue.assignees.nodes ?? []) {
        if (assignee) {
          associated.push(assignee.login);
        }
      }
      if (associated.length > 0) {
        result += ` - ${associated.map((a) => `@${a}`).join(", ")}`;
      }
      return result;
    }

    const issueText = `<!-- Agenda+ -->

${this.agendaPRs
  .filter(isUnshownIssueOrPR)
  .map((issue) => renderIssue(issue))
  .join("\n")}
${this.agendaIssues
  .filter(isUnshownIssueOrPR)
  .map((issue) => renderIssue(issue))
  .join("\n")}

<!-- PRs -->

${this.pendingPRs
  .filter(isUnshownIssueOrPR)
  .map((issue) => renderIssue(issue))
  .join("\n")}

<!-- Design Reviews -->

${this.openReviews
  .filter(isUnshownIssueOrPR)
  .map((issue) => renderIssue(issue))
  .join("\n")}
`;

    this._fileContents = `### Call Agenda

This agenda can be viewed and updated on [Github](https://github.com/w3ctag/meetings/blob/gh-pages/${this._year}/telcons/${this._filename}).

If you would like to add an item to the agenda or volunteer to scribe please open a pull request against this agenda.

${calls
  .map(
    ({ time, label }) => `
### ${label} - [${utcDate(
      time,
    )}](https://www.timeanddate.com/worldclock/converter.html?iso=${dateURL(
      time,
    )}&p1=224&p2=43&p3=136&p4=195&p5=33&p6=248&p7=240)
`,
  )
  .join("")}
${issueText}
* Breakout Rollup
* [Issue Triage](https://github.com/w3ctag/design-reviews/issues?q=is%3Aissue+is%3Aopen+label%3A%22Progress%3A+untriaged%22)

### Logistics

Chair:

Scribe:

Bridge: https://meet.google.com/vvu-apdo-hrj

*Please note*: this meeting is open to TAG members and invited guests. If you would like to participate, please email the chairs.

Archived minutes: https://github.com/w3ctag/meetings/blob/gh-pages/${this._year}/telcons/${minutesFilename}

Raw minutes: ...


### Local Call Times

${calls
  .map(
    ({ time, label }) => `
#### ${label}

<table>
<tr><td> San Francisco (U.S.A. - California) <td> ${printTime(
      time,
      "America/Los_Angeles",
      "en-US",
    )}</td></tr>
<tr><td> Boston (U.S.A. - Massachusetts) <td> ${printTime(
      time,
      "America/New_York",
      "en-US",
    )}</td></tr>
<tr><td> London (United Kingdom - England) <td> ${printTime(
      time,
      "Europe/London",
      "en-GB",
    )}</td></tr>
<tr><td> Paris (France) <td> ${printTime(time, "Europe/Paris", "fr-FR")}</td></tr>
<tr><td> Beijing (China) <td> ${printTime(time, "Asia/Shanghai", "zh-CN")}</td></tr>
<tr><td> Sydney (Australia) <td> ${printTime(
      time,
      "Australia/Sydney",
      "en-AU",
    )}</td></tr>
<tr><td> Corresponding UTC (GMT) <td> ${printTime(time, "UTC", "en-GB")}</td></tr>
</table>
`,
  )
  .join("")}
`;
  }

  render() {
    return html`
      <label for="plenary">Plenary</label>
      <select id="plenary" @change=${this._plenaryChange}>
        <option value=${wedMornPlenaryHours}>Wednesday Morning UTC</option>
        <option value=${thurAftPlenaryHours}>Thursday Afternoon UTC</option>
      </select>

      <label for="week">Week</label>
      <input
        id="week"
        type="date"
        value=${this._weekOf.toISOString().slice(0, 10)}
        @change=${this._dateChange}
      />

      <p>
        <a
          href="https://github.com/w3ctag/meetings/new/gh-pages/?filename=${encodeURIComponent(
            `/${this._year}/telcons/${this._filename}`,
          )}&amp;value=${encodeURIComponent(
            "The agenda was copied; paste it here.",
          )}"
          target="_blank"
          @click=${this.copyContents}
          >Click here to create file.</a
        >
      </p>

      <input
        type="text"
        style="grid-column: span 2"
        readonly
        value=${this._filename}
      />
      <textarea id="contents" rows="40" .value=${this._fileContents}></textarea>
    `;
  }

  copyContents() {
    const contents = this._contentsTextArea;
    if (contents) {
      void navigator.clipboard.writeText(contents.value);
    }
  }
}
