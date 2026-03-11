export const getCurrentQuarterInfo = () => {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const year = now.getFullYear();
  return { quarter, year };
};

export const getCurrentQuarterId = () => {
  const { quarter, year } = getCurrentQuarterInfo();
  return `${year}-Q${quarter}`;
};

export const isCurrentQuarter = (dateString: string) => {
  const date = new Date(dateString);
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  const year = date.getFullYear();
  const current = getCurrentQuarterInfo();
  return year === current.year && quarter === current.quarter;
};
