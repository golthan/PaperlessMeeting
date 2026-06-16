export function getPagination(query) {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

export function paged(data, meta) {
  return {
    data,
    meta
  };
}

