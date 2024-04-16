export const formatNumber = (num: number) => {
  return num.toLocaleString("en-US", {
    style: "decimal",
    maximumFractionDigits: 0,
  });
};

export const formatNumberPrice = (num: number) => {
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
};
