import { t } from "@lingui/macro";
import { useTheme } from "@mui/material/styles";
import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "src/components/Chart/Chart";
import { ChartType, DataFormat } from "src/components/Chart/Constants";
import {
  TokenRecord,
  TokenRecord_Filter,
  TokenRecordsDocument,
  TokenRecordsQuery,
  TokenRecordsQueryVariables,
  useInfiniteTokenRecordsQuery,
} from "src/generated/graphql";
import { formatCurrency } from "src/helpers";
import { adjustDateByDays, getISO8601String } from "src/helpers/DateHelper";
import { getBulletpointStylesMap, getCategoriesMap, getDataKeyColorsMap } from "src/helpers/ProtocolMetricsHelper";
import {
  CATEGORY_POL,
  CATEGORY_STABLE,
  CATEGORY_VOLATILE,
  DEFAULT_BULLETPOINT_COLOURS,
  DEFAULT_COLORS,
  DEFAULT_RECORD_COUNT,
  GraphProps,
  LiquidBackingProps,
} from "src/views/TreasuryDashboard/components/Graph/Constants";
import { getTickStyle } from "src/views/TreasuryDashboard/components/Graph/helpers/ChartHelper";
import {
  getNextPageStartDate,
  getSubgraphQueryExplorerUrl,
} from "src/views/TreasuryDashboard/components/Graph/helpers/SubgraphHelper";
import {
  filterReduce,
  getNextPageParamFactory,
  getTokenRecordDateMap,
} from "src/views/TreasuryDashboard/components/Graph/helpers/TokenRecordsQueryHelper";

export const TreasuryAssetsGraph = ({
  subgraphUrl,
  earliestDate,
  onMouseMove,
  isLiquidBackingActive,
}: GraphProps & LiquidBackingProps) => {
  const queryExplorerUrl = getSubgraphQueryExplorerUrl(TokenRecordsDocument, subgraphUrl);
  const theme = useTheme();
  const chartName = "TreasuryAssetsGraph";

  const initialFinishDate = getISO8601String(adjustDateByDays(new Date(), 1)); // Tomorrow
  const initialStartDate = !earliestDate ? null : getNextPageStartDate(initialFinishDate, earliestDate);
  const baseFilter: TokenRecord_Filter = {};

  /**
   * Pagination:
   *
   * We create {paginator} within a useEffect block, so that it isn't re-created every re-render.
   */
  const paginator = useRef<(lastPage: TokenRecordsQuery) => TokenRecordsQueryVariables | undefined>();
  useEffect(() => {
    // We can't create the paginator until we have an earliestDate
    if (!earliestDate) {
      return;
    }

    paginator.current = getNextPageParamFactory(chartName, earliestDate, DEFAULT_RECORD_COUNT, baseFilter);
  }, [earliestDate]);

  /**
   * This code block kicks off data fetching with an initial date range.
   *
   * The definition of getNextPageParam() handles pagination.
   */
  const { data, hasNextPage, fetchNextPage, refetch } = useInfiniteTokenRecordsQuery(
    { endpoint: subgraphUrl },
    "filter",
    {
      filter: {
        ...baseFilter,
        date_gte: initialStartDate,
        date_lt: initialFinishDate,
      },
      recordCount: DEFAULT_RECORD_COUNT,
    },
    {
      enabled: earliestDate !== null,
      getNextPageParam: paginator.current,
    },
  );

  const resetCachedData = () => {
    setByDateMetrics([]);
    setTotal("");
  };

  /**
   * We need to trigger a re-fetch when the earliestDate prop is changed.
   */
  useEffect(() => {
    if (!earliestDate) {
      return;
    }

    console.debug(chartName + ": earliestDate changed to " + earliestDate + ". Re-fetching.");
    resetCachedData();
    refetch();
  }, [earliestDate, refetch]);

  /**
   * Any time the data changes, we want to check if there are more pages (and data) to fetch.
   *
   * react-query's infinite query functionality apparently does not support automatically
   * fetching all pages. This code block achieves that.
   */
  useEffect(() => {
    if (hasNextPage) {
      console.debug(chartName + ": fetching next page");
      fetchNextPage();
      return;
    }
  }, [data, hasNextPage, fetchNextPage]);

  type DateTreasuryMetrics = {
    date: string;
    timestamp: number;
    block: number;
    marketStable: number;
    marketVolatile: number;
    marketPol: number;
    marketTotal: number;
    liquidStable: number;
    liquidVolatile: number;
    liquidPol: number;
    liquidTotal: number;
  };
  const [byDateMetrics, setByDateMetrics] = useState<DateTreasuryMetrics[]>([]);
  const [total, setTotal] = useState("");

  /**
   * Generates an array containing one DateTreasuryMetrics element for each date,
   * in which the metrics are contained.
   *
   * The array is sorted in descending order by date.
   *
   * @param tokenRecords
   * @returns
   */
  const getDateTreasuryMetrics = (tokenRecords: TokenRecord[]): DateTreasuryMetrics[] => {
    const dateTokenRecords = getTokenRecordDateMap(tokenRecords);
    const dateMetricsMap: Map<string, DateTreasuryMetrics> = new Map<string, DateTreasuryMetrics>();

    /**
     * For each date, we have an array of token records.
     *
     * The relevant total is calculated by applying certain filters and summing (reducing) the value for the matching records.
     */
    dateTokenRecords.forEach((value, key) => {
      const marketStable = filterReduce(value, record => record.category == CATEGORY_STABLE);
      const marketVolatile = filterReduce(value, record => record.category == CATEGORY_VOLATILE);
      const marketPol = filterReduce(value, record => record.category == CATEGORY_POL);
      const liquidStable = filterReduce(value, record => record.category == CATEGORY_STABLE && record.isLiquid == true);
      const liquidVolatile = filterReduce(
        value,
        record => record.category == CATEGORY_VOLATILE && record.isLiquid == true,
      );
      const liquidPol = filterReduce(value, record => record.category == CATEGORY_POL && record.isLiquid == true);

      const dateMetric: DateTreasuryMetrics = {
        date: key,
        timestamp: new Date(key).getTime(), // We inject the timestamp, as it's used by the Chart component
        block: value[0].block,
        marketStable: marketStable,
        marketVolatile: marketVolatile,
        marketPol: marketPol,
        marketTotal: marketStable + marketVolatile + marketPol,
        liquidStable: liquidStable,
        liquidVolatile: liquidVolatile,
        liquidPol: liquidPol,
        liquidTotal: liquidStable + liquidVolatile + liquidPol,
      };

      dateMetricsMap.set(key, dateMetric);
    });

    // Sort in descending date order
    return Array.from(dateMetricsMap.values()).sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  };

  /**
   * Chart population:
   *
   * When data loading is finished, the token records are processed into a compatible structure.
   */
  useMemo(() => {
    if (hasNextPage || !data) {
      // While data is loading, ensure dependent data is empty
      console.debug(`${chartName}: removing cached data, as query is in progress.`);
      resetCachedData();
      return;
    }

    // We need to flatten the tokenRecords from all of the pages arrays
    console.debug(`${chartName}: rebuilding by date metrics`);
    const tokenRecords = data.pages.map(query => query.tokenRecords).flat();
    const tempByDateMetrics = getDateTreasuryMetrics(tokenRecords);
    setByDateMetrics(tempByDateMetrics);
  }, [data, hasNextPage]);

  useMemo(() => {
    if (!byDateMetrics.length) {
      setTotal("");
      return;
    }

    // Date descending order, so 0 is the latest
    const lastMetric = byDateMetrics[0];
    const tempTotal = isLiquidBackingActive ? lastMetric.liquidTotal : lastMetric.marketTotal;
    setTotal(formatCurrency(tempTotal, 0));
  }, [byDateMetrics, isLiquidBackingActive]);

  // What is displayed in the chart differs based on the value of isLiquidBackingActive
  const itemNames: string[] = [
    t`Stablecoins`,
    t`Volatile Assets`,
    t`Protocol-Owned Liquidity`,
    ...(isLiquidBackingActive ? [t`Market Value`] : [t`Liquid Backing`]),
  ];
  const dataKeys: string[] = isLiquidBackingActive
    ? ["liquidStable", "liquidVolatile", "liquidPol", "marketTotal"]
    : ["marketStable", "marketVolatile", "marketPol", "liquidTotal"];
  // The keys to display as a line
  const composedLineDataKeys: string[] = isLiquidBackingActive ? ["marketTotal"] : ["liquidTotal"];

  // No caching needed, as these are static categories
  const categoriesMap = getCategoriesMap(itemNames, dataKeys);
  const bulletpointStylesMap = getBulletpointStylesMap(DEFAULT_BULLETPOINT_COLOURS, dataKeys);
  const colorsMap = getDataKeyColorsMap(DEFAULT_COLORS, dataKeys);

  return (
    <Chart
      type={ChartType.Composed}
      data={byDateMetrics}
      dataKeys={dataKeys}
      dataKeyColors={colorsMap}
      dataFormat={DataFormat.Currency}
      headerText={isLiquidBackingActive ? t`Treasury Liquid Backing` : t`Market Value of Treasury Assets`}
      headerSubText={total}
      dataKeyBulletpointStyles={bulletpointStylesMap}
      dataKeyLabels={categoriesMap}
      infoTooltipMessage={
        isLiquidBackingActive
          ? t`Liquid backing is the dollar amount of stablecoins, volatile assets and protocol-owned liquidity in the treasury, excluding OHM. This excludes the value of any illiquid (vesting/locked) assets. It represents the budget the Treasury has for specific market operations which cannot use OHM (inverse bonds, some liquidity provision, OHM incentives, etc).`
          : t`Market Value of Treasury Assets is the sum of the value (in dollars) of all assets held by the treasury (excluding pTokens).`
      }
      isLoading={byDateMetrics.length == 0}
      itemDecimals={0}
      subgraphQueryUrl={queryExplorerUrl}
      displayTooltipTotal={true}
      tickStyle={getTickStyle(theme)}
      composedLineDataKeys={composedLineDataKeys}
      onMouseMove={onMouseMove}
    />
  );
};
