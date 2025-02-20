import { Temporal } from "@js-temporal/polyfill";
import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

type AvailableTime = {
  days: Day[];
  start: Temporal.PlainTime;
  end: Temporal.PlainTime;
};

type Availability = {
  name: string;
  tz: string;
  tzoffset: Temporal.ZonedDateTime;
  core: AvailableTime[];
  rare: AvailableTime[];
  except: AvailableTime[];
};

type Avail = "core" | "rare" | "no";

const daysByName = {
  M: 1,
  T: 2,
  W: 3,
  Th: 4,
  F: 5,
  Sa: 6,
  Su: 7,
} as const;
const days = ["M", "T", "W", "Th", "F", "Sa", "Su"] as const;
type Day = keyof typeof daysByName;
function dayRange(startDay: Day, endDay: Day | undefined) {
  if (endDay === undefined) return [startDay];
  return days.slice(daysByName[startDay] - 1, daysByName[endDay]);
}

function narrowingIncludes<T, U>(
  arr: readonly T[],
  needle: U,
): needle is T & U {
  const widenedArr: readonly (T | U)[] = arr;
  return widenedArr.includes(needle);
}

function expandRanges(ranges: AvailableTime[]): Set<string> {
  const result = new Set<string>();
  for (const range of ranges) {
    for (const day of range.days) {
      let { start } = range;
      while (!start.equals(range.end)) {
        result.add(`${day}:${String(start)}`);
        start = start.add({ minutes: 30 });
      }
    }
  }
  return result;
}

class ExpandedAvailability {
  name: string;
  tz: string;
  tzoffset: Temporal.ZonedDateTime;
  /** Keys are of the form "day:hh:mm". */
  _avail: Map<string, Avail>;

  constructor({ name, tz, tzoffset, core, rare, except }: Availability) {
    this.name = name;
    this.tz = tz;
    this.tzoffset = tzoffset;
    this._avail = new Map();

    const exceptSet = expandRanges(except);
    const initialCore = expandRanges(core);
    const initialRare = expandRanges(rare);
    for (const r of initialRare) {
      if (!exceptSet.has(r)) {
        this._avail.set(r, "rare");
      }
    }
    for (const c of initialCore) {
      if (!exceptSet.has(c)) {
        this._avail.set(c, "core");
      }
    }
  }

  available(day: Day, time: Temporal.PlainTime): Avail {
    return this._avail.get(`${day}:${time.toString()}`) ?? "no";
  }

  static compareByTzOffset(a: ExpandedAvailability, b: ExpandedAvailability) {
    return Temporal.ZonedDateTime.compare(a.tzoffset, b.tzoffset);
  }
}

/**
 * Parses lines like "Core: M 08:00-12:00, 13:00-18:00; T-F 09:00-17:00".
 *
 * @param header e.g. "Core:", "Rare:", or "Except:"
 */
function parseAvailableTimes(lines: string[], header: string): AvailableTime[] {
  return lines
    .filter((line) => line.includes(header))
    .flatMap((line) => {
      const dayGroups = line.slice(line.indexOf(header) + header.length);
      return dayGroups.split(";").flatMap((group) => {
        const daysMatch =
          /(?<startDay>[A-Za-z]+)(?:-(?<endDay>[A-Za-z]+))?/.exec(group);
        if (!daysMatch?.groups) {
          throw new Error(
            `'${group}' in '${line}' does not start with a day or range of days.`,
          );
        }
        const { startDay, endDay } = daysMatch.groups;
        if (!narrowingIncludes(days, startDay)) {
          throw new Error(
            `${startDay} in '${line}' is not the name of a day. Use one of ${String(days)}.`,
          );
        }
        // endDay can be undefined when its group is missing, but we'd need to enable
        // https://www.typescriptlang.org/tsconfig/#noUncheckedIndexedAccess project-wide to get the
        // more-accurate typing here.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (endDay !== undefined && !narrowingIncludes(days, endDay)) {
          throw new Error(
            `${endDay} in '${line}' is not the name of a day. Use one of ${String(days)}.`,
          );
        }
        return group
          .slice(daysMatch.index + daysMatch[0].length)
          .split(",")
          .map((timeRange) => {
            const [startTime, endTime] = timeRange
              .split("-")
              .map((s) => s.trim());
            const start = Temporal.PlainTime.from(startTime);
            const end = Temporal.PlainTime.from(endTime);
            if (start.minute !== 0 && start.minute !== 30) {
              throw new Error(
                `${startTime} must be on a half-hour in '${line}'.`,
              );
            }
            if (end.minute !== 0 && end.minute !== 30) {
              throw new Error(
                `${endTime} must be on a half-hour in '${line}'.`,
              );
            }
            return { days: dayRange(startDay, endDay), start, end };
          });
      });
    });
}

/**
 * Parses input of the form
 *
 * ## Name (tzdb timezone name)
 *
 * * Core: M 08:00-10:00, 13:00-15:00; T-Th 09:00-17:00
 * * Rare: M-F 20:00-00:00
 * * Except: W 10:00-11:30
 *
 * into an Availability list.
 */
function parse(input: string, date: Temporal.PlainDate): Availability[] {
  const result = input
    .split("##")
    .slice(1)
    .map((person): Error | Availability => {
      const lines = person.split("\n");
      const nameLine = /^\s*(?<name>.+)\s*\((?<tz>[^)]+)\)\s*$/.exec(lines[0]);
      if (!nameLine?.groups || !nameLine.groups.name || !nameLine.groups.tz) {
        return new Error(
          `##${lines[0]} did not contain a person's name and their timezone, formatted like '## Name (Continent/City)'`,
        );
      }
      const { name, tz } = nameLine.groups;
      const tzoffset = date.toZonedDateTime({ timeZone: tz });
      const core = parseAvailableTimes(lines, "Core:");
      const rare = parseAvailableTimes(lines, "Rare:");
      const except = parseAvailableTimes(lines, "Except:");
      return { name, tz, tzoffset, core, rare, except };
    });
  const errors = result.filter((i): i is Error => i instanceof Error);
  if (errors.length > 0) {
    throw errors.length > 1 ? new AggregateError(errors) : errors[0];
  }

  return result.filter((i): i is Availability => !(i instanceof Error));
}

@customElement("tag-scheduler")
export class TagScheduler extends LitElement {
  static styles = css`
    table {
      border-collapse: collapse;
    }
    th {
      text-align: left;
      text-wrap-mode: nowrap;
    }
    th,
    td {
      border: thin grey solid;
    }
    td {
      min-width: 1ex;
    }
    .core {
      background-color: green;
    }
    .rare {
      background-color: orange;
    }
    .no {
      background-color: red;
    }
  `;

  @state()
  private _referenceDate = Temporal.Now.plainDateISO();

  @state()
  private _availabilityString = localStorage.getItem("availability") ?? "";

  @state()
  private _availability: ExpandedAvailability[] =
    this._processAvailability(this._availabilityString) ?? [];

  @state()
  private _timezone = localStorage.getItem("timezone") ?? "UTC";

  @state()
  private _timezones = [this._timezone];

  @state()
  private _errors: string = "";

  render() {
    return html`
      <br />
      <label
        >Availability data<br />
        <textarea
          rows="30"
          cols="100"
          .value=${this._availabilityString}
          @input=${this._updateAvailability}
        ></textarea>
      </label>
      <div>
        <label
          >Meeting week:
          <input
            id="date"
            type="date"
            value=${this._referenceDate.toString()}
            @change=${this._updateReferenceDate}
        /></label>
      </div>
      <div>
        <label
          >Display timezone:
          <select @change=${this._updateTimezone}>
            ${this._timezones.map(
              (tz) =>
                html`<option ?selected=${tz === this._timezone}>${tz}</option>`,
            )}
          </select></label
        >
      </div>
      <div id="errors">${this._errors}</div>
      ${this.renderResultTable()}
    `;
  }

  renderResultTable() {
    if (this._availability.length === 0) {
      return nothing;
    }
    const monday = this._referenceDate.subtract({
      days: this._referenceDate.dayOfWeek - 1,
    });
    const friday = this._referenceDate.add({
      days: 5 - this._referenceDate.dayOfWeek,
    });
    const earliest = monday.toZonedDateTime({
      plainTime: "00:00",
      timeZone: this._availability[0].tz,
    });
    const latest = friday.toZonedDateTime({
      plainTime: "23:30",
      timeZone: this._availability[this._availability.length - 1].tz,
    });
    const allTimes: Temporal.ZonedDateTime[] = [];
    for (
      let current = earliest.withTimeZone(this._timezone);
      Temporal.Instant.compare(current.toInstant(), latest.toInstant()) < 0;
      current = current.add({ minutes: 30 })
    ) {
      allTimes.push(current);
    }

    return html`<table id="results">
      <thead>
        <tr>
          <td></td>
          ${Object.entries(
            Object.groupBy(allTimes, (time) =>
              time.toLocaleString(undefined, { dateStyle: "medium" }),
            ),
          ).map(
            ([date, times]) => html`<th colspan=${times!.length}>${date}</th>`,
          )}
        </tr>
        <tr>
          <td></td>
          ${allTimes
            .filter(({ minute }) => minute === 0)
            .map(
              (time) =>
                html`<th colspan="2">
                  ${time.hour.toString().padStart(2, "0")}
                </th>`,
            )}
        </tr>
      </thead>
      ${this._availability.map(
        (person) =>
          html`<tr>
            <th scope="row">${person.name}</th>
            ${allTimes.map((time) => {
              const localTime = time.withTimeZone(person.tz);
              return html`<td
                class=${person.available(
                  days[localTime.dayOfWeek - 1],
                  localTime.toPlainTime(),
                )}
                title=${time.withTimeZone(person.tz).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "numeric",
                  timeZoneName: "short",
                })}
              ></td>`;
            })}
          </tr>`,
      )}
    </table>`;
  }

  private _updateReferenceDate(e: Event) {
    if (e.target instanceof HTMLInputElement) {
      this._referenceDate = Temporal.PlainDate.from(e.target.value);
    }
  }

  private _updateTimezone(e: Event) {
    if (e.target instanceof HTMLSelectElement) {
      this._timezone = e.target.value;
      localStorage.setItem("timezone", e.target.value);
    }
  }

  private _updateAvailability(e: Event) {
    if (!(e.target instanceof HTMLTextAreaElement)) return;
    this._availabilityString = e.target.value;
    localStorage.setItem("availability", this._availabilityString);

    const newAvailability = this._processAvailability(this._availabilityString);
    if (newAvailability !== undefined) {
      // Don't update the results on a parse error.
      this._availability = newAvailability;
    }
  }

  private _processAvailability(
    availabilityString: string,
  ): ExpandedAvailability[] | undefined {
    this._errors = "";
    let expandedAvailability: ExpandedAvailability[];
    try {
      const availability = parse(availabilityString, this._referenceDate);
      expandedAvailability = availability.map(
        (a) => new ExpandedAvailability(a),
      );
    } catch (e: unknown) {
      this._errors = `Error: ${String(e)}`;
      return undefined;
    }
    expandedAvailability.sort(ExpandedAvailability.compareByTzOffset);

    const valueSet = new Set(expandedAvailability.map((a) => a.tz));
    valueSet.add("UTC");
    this._timezones = [...valueSet];

    return expandedAvailability;
  }
}
