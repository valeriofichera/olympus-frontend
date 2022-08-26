import { adjustDateByDays, getISO8601String } from "src/helpers/DateHelper";

const DEFAULT_DATE_OFFSET = -14;

const encodeURL = (url: string, mangledNewline = false): string => {
  const amendedUrl = url
    .replaceAll(" ", "+")
    .replaceAll("$", "%24")
    .replaceAll(":", "%3A")
    .replaceAll(",", "%2C")
    .replaceAll("{", "%7B")
    .replaceAll("}", "%7D")
    .replaceAll("(", "%28")
    .replaceAll(")", "%29")
    .replaceAll("=", "%3D")
    .replaceAll("!", "%21")
    .replaceAll('"', "%5C%22");

  return mangledNewline ? amendedUrl.replaceAll("\n", "%5Cn") : amendedUrl.replaceAll("\n", "%0A");
};

export const getSubgraphQueryExplorerUrl = (
  queryDocument: string,
  subgraphUrl: string,
  variables?: unknown,
): string => {
  /**
   * While there is support for variables, and the URL we generate exactly matches what the GraphiQL Explorer generates,
   * there is a bug with the GraphiQL Explorer, where it does not load variables from the URL: https://github.com/OneGraph/graphiql-explorer/issues/87
   *
   * Example URL: https://api.thegraph.com/subgraphs/id/QmWrvfZh9qXPV5oJWapWZsgnPDEQAys2sGL1DBkkV7FEnt/graphql?query=%0A++++query+TokenRecords%28%24recordCount%3A+Int%21%2C+%24startingRecord%3A+Int+%3D+0%2C+%24filter%3A+TokenRecord_filter%29+%7B%0A++tokenRecords%28%0A++++first%3A+%24recordCount%0A++++skip%3A+%24startingRecord%0A++++where%3A+%24filter%0A++++orderBy%3A+date%0A++++orderDirection%3A+desc%0A++%29+%7B%0A++++id%0A++++balance%0A++++block%0A++++category%0A++++date%0A++++isBluechip%0A++++isLiquid%0A++++multiplier%0A++++rate%0A++++source%0A++++sourceAddress%0A++++timestamp%0A++++token%0A++++tokenAddress%0A++++value%0A++++valueExcludingOhm%0A++%7D%0A%7D%0A++++&variables=%22%7B%5Cn++%5C%22recordCount%5C%22%3A+1000%2C%5Cn++%5C%22filter%5C%22%3A+%7B%5Cn++++%5C%22isLiquid%5C%22%3A+true%2C%5Cn++++%5C%22date_gte%5C%22%3A+%5C%222022-08-10%5C%22%5Cn++%7D%5Cn%7D%22&operationName=TokenRecords
   */
  const variablesParameter = !variables
    ? ""
    : `&variables=%22${encodeURL(`${JSON.stringify(variables, null, 2)}`, true)}%22`;

  return `${subgraphUrl}/graphql?query=${encodeURL(queryDocument)}${variablesParameter}`;
};

/**
 * Returns a date string (YYYY-MM-DD format) that represents the start date
 * for the next page in a react-query infinite query.
 *
 * If {earliestDateString} is greater than the adjusted date, it will be returned.
 *
 * @param dateString
 * @param earliestDateString
 * @returns
 */
export const getNextPageStartDate = (
  dateString: string,
  earliestDateString: string,
  offset = DEFAULT_DATE_OFFSET,
): string => {
  const date = adjustDateByDays(new Date(dateString), offset);
  const earliestDate = new Date(earliestDateString);
  // We don't want to go further back than the earliestDate
  const finalDate = date.getTime() < earliestDate.getTime() ? earliestDate : date;

  return getISO8601String(finalDate);
};
