import { useTheme } from "@mui/material/styles";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import Chart from "src/components/Chart/Chart";
import { ChartType, DataFormat } from "src/components/Chart/Constants";
import {
  ProtocolMetricsDocument,
  TokenSuppliesQuery,
  TokenSuppliesQueryVariables,
  TokenSupply_Filter,
  useInfiniteTokenSuppliesQuery,
} from "src/generated/graphql";
import { adjustDateByDays, getISO8601String } from "src/helpers/DateHelper";
import {
  getBulletpointStylesMap,
  getCategoriesMap,
  getDataKeyColorsMap,
} from "src/helpers/subgraph/ProtocolMetricsHelper";
import {
  getOhmCirculatingSupply,
  getOhmFloatingSupply,
  getOhmTotalSupply,
} from "src/helpers/subgraph/TreasuryQueryHelper";
import {
  DEFAULT_BULLETPOINT_COLOURS,
  DEFAULT_COLORS,
  DEFAULT_RECORD_COUNT,
  GraphProps,
} from "src/views/TreasuryDashboard/components/Graph/Constants";
import { getTickStyle } from "src/views/TreasuryDashboard/components/Graph/helpers/ChartHelper";
import {
  getNextPageStartDate,
  getSubgraphQueryExplorerUrl,
} from "src/views/TreasuryDashboard/components/Graph/helpers/SubgraphHelper";
import {
  getNextPageParamFactory as getNextPageParamTokenSupplyFactory,
  getTokenSupplyDateMap,
} from "src/views/TreasuryDashboard/components/Graph/helpers/TokenSupplyQueryHelper";

/**
 * React Component that displays a line graph comparing the
 * OHM circulating and floating supply.
 */
export const OhmSupplyGraph = ({ subgraphUrl, earliestDate }: GraphProps) => {
  const queryExplorerUrl = getSubgraphQueryExplorerUrl(ProtocolMetricsDocument, subgraphUrl);
  const theme = useTheme();
  const chartName = "OhmSupply";

  const initialFinishDate = getISO8601String(adjustDateByDays(new Date(), 1)); // Tomorrow
  const initialStartDate = !earliestDate ? null : getNextPageStartDate(initialFinishDate, earliestDate);

  const [baseFilter] = useState<TokenSupply_Filter>({});

  /**
   * Pagination:
   *
   * We create {paginator} within a useEffect block, so that it isn't re-created every re-render.
   */
  const tokenSuppliesPaginator = useRef<(lastPage: TokenSuppliesQuery) => TokenSuppliesQueryVariables | undefined>();
  useEffect(() => {
    // We can't create the paginator until we have an earliestDate
    if (!earliestDate) {
      return;
    }

    console.info(`${chartName}: earliestDate changed to ${earliestDate}. Re-fetching.`);

    // Reset cache
    resetCachedData();

    // Force fetching of data with the new paginator
    // Calling refetch() after setting the new paginator causes the query to never finish
    tokenSuppliesRefetch();

    // Create a new paginator with the new earliestDate
    tokenSuppliesPaginator.current = getNextPageParamTokenSupplyFactory(
      chartName,
      earliestDate,
      DEFAULT_RECORD_COUNT,
      baseFilter,
    );
  }, [baseFilter, earliestDate]);

  /**
   * Data Fetching:
   *
   * This code block kicks off data fetching with an initial date range.
   *
   * The definition of getNextPageParam() handles pagination.
   */
  // TokenSupply
  const {
    data: tokenSuppliesData,
    hasNextPage: tokenSuppliesHasNextPage,
    fetchNextPage: tokenSuppliesFetchNextPage,
    refetch: tokenSuppliesRefetch,
  } = useInfiniteTokenSuppliesQuery(
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
      enabled: earliestDate !== null && baseFilter !== null,
      getNextPageParam: tokenSuppliesPaginator.current,
    },
  );

  const resetCachedData = () => {
    setByDateSupply([]);
  };

  /**
   * Any time the data changes, we want to check if there are more pages (and data) to fetch.
   *
   * react-query's infinite query functionality apparently does not support automatically
   * fetching all pages. This code block achieves that.
   */
  useEffect(() => {
    if (tokenSuppliesHasNextPage) {
      console.debug(chartName + ": fetching next page of tokenSupplies");
      tokenSuppliesFetchNextPage();
      return;
    }
  }, [tokenSuppliesData, tokenSuppliesHasNextPage, tokenSuppliesFetchNextPage]);

  /**
   * Chart population:
   *
   * When the data fetching for all three queries is completed,
   * the calculations are performed and cached. This avoids re-calculation
   * upon every rendering loop.
   */
  type SupplyComparison = {
    date: string;
    timestamp: number;
    block: number;
    totalSupply: number;
    circulatingSupply: number;
    floatingSupply: number;
    totalSupplyPercentage: number;
    circulatingSupplyPercentage: number;
    floatingSupplyPercentage: number;
  };
  const [byDateSupply, setByDateSupply] = useState<SupplyComparison[]>([]);
  useMemo(() => {
    // While data is loading, ensure dependent data is empty
    if (tokenSuppliesHasNextPage || !tokenSuppliesData) {
      console.debug(`${chartName}: removing cached data, as query is in progress.`);
      resetCachedData();
      return;
    }

    // We need to flatten the records from all of the pages arrays
    console.debug(`${chartName}: rebuilding by date metrics`);
    const byDateTokenSupplies = getTokenSupplyDateMap(tokenSuppliesData.pages.map(query => query.tokenSupplies).flat());

    const tempByDateSupply: SupplyComparison[] = [];
    byDateTokenSupplies.forEach((value, key) => {
      const currentTokenSupplies = value;

      const latestTokenSupply = currentTokenSupplies[0];

      const supplyRecord: SupplyComparison = {
        date: key,
        timestamp: new Date(key).getTime(), // We inject the timestamp, as it's used by the Chart component
        block: latestTokenSupply.block,
        totalSupply: getOhmTotalSupply(currentTokenSupplies),
        circulatingSupply: getOhmCirculatingSupply(currentTokenSupplies),
        floatingSupply: getOhmFloatingSupply(currentTokenSupplies),
        totalSupplyPercentage: 100,
        circulatingSupplyPercentage:
          (getOhmCirculatingSupply(currentTokenSupplies) * 100) / getOhmTotalSupply(currentTokenSupplies),
        floatingSupplyPercentage:
          (getOhmFloatingSupply(currentTokenSupplies) * 100) / getOhmTotalSupply(currentTokenSupplies),
      };

      tempByDateSupply.push(supplyRecord);
    });

    setByDateSupply(tempByDateSupply);
  }, [tokenSuppliesHasNextPage, tokenSuppliesData]);

  /**
   * Header subtext
   */
  const [currentBackingHeaderText] = useState("");

  /**
   * There are a number of variables (data keys, categories) that are dependent on the value of
   * {isLiquidBackingActive}. As a result, we watch for changes to that prop and re-create the
   * cached variables.
   */
  const [dataKeys, setDataKeys] = useState<string[]>([]);
  const [categoriesMap, setCategoriesMap] = useState(new Map<string, string>());
  const [bulletpointStylesMap, setBulletpointStylesMap] = useState(new Map<string, CSSProperties>());
  const [colorsMap, setColorsMap] = useState(new Map<string, string>());
  const [headerText, setHeaderText] = useState("");
  const [tooltipText, setTooltipText] = useState("");
  useMemo(() => {
    const tempDataKeys = ["totalSupplyPercentage", "circulatingSupplyPercentage", "floatingSupplyPercentage"];
    setDataKeys(tempDataKeys);

    const itemNames: string[] = ["Total Supply", "Circulating Supply", "Floating Supply"];

    setCategoriesMap(getCategoriesMap(itemNames, tempDataKeys));
    setBulletpointStylesMap(getBulletpointStylesMap(DEFAULT_BULLETPOINT_COLOURS, tempDataKeys));
    setColorsMap(getDataKeyColorsMap(DEFAULT_COLORS, tempDataKeys));
    setHeaderText("OHM Supply");
    setTooltipText(
      `This chart illustrates the amount of circulating and floating OHM, relative to the total supply. Circulating and floating supply are increased by normal bonds and decreased by inverse bonds.`,
    );
  }, []);

  return (
    <Chart
      type={ChartType.MultiLine}
      data={byDateSupply}
      dataKeys={dataKeys}
      dataKeyColors={colorsMap}
      headerText={headerText}
      headerSubText={currentBackingHeaderText}
      dataFormat={DataFormat.Percentage}
      dataKeyBulletpointStyles={bulletpointStylesMap}
      dataKeyLabels={categoriesMap}
      margin={{ left: 30 }}
      infoTooltipMessage={tooltipText}
      isLoading={byDateSupply.length == 0}
      itemDecimals={2}
      subgraphQueryUrl={queryExplorerUrl}
      tickStyle={getTickStyle(theme)}
      maxYValue={100}
    />
  );
};
