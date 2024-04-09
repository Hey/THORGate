export const formatNumber = (num: number) => {
  return num.toLocaleString("en-US", {
    style: "decimal",
    maximumFractionDigits: 0,
  });
};
