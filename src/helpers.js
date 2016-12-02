export const filter = {
  create: (fieldName, operator, value) => {
    return {
      fieldName,
      operator,
      value
    }
  },
  operators: {
    numeric: { equals: "equals", notEquals: "notEquals", greaterThan: "greaterThan", greaterThanOrEqualsTo: "greaterThanOrEqualsTo", lessThan: "lessThan", lessThanOrEqualsTo: "lessThanOrEqualsTo", empty: "empty", notEmpty: "notEmpty" },
    date: { equals: "equals", notEquals: "notEquals", greaterThan: "greaterThan", greaterThanOrEqualsTo: "greaterThanOrEqualsTo", lessThan: "lessThan", lessThanOrEqualsTo: "lessThanOrEqualsTo", empty: "empty", notEmpty: "notEmpty" },
    text: { equals: "equals", notEquals: "notEquals", startsWith: "startsWith", endsWith: "endsWith", contains: "contains", notContains: "notContains", empty: "empty", notEmpty: "notEmpty" },
    boolean: { equals: "equals" },
    relation: { in: "in" }
  }
}

export const sort = {
  create: (fieldName, order) => {
    return {
      fieldName,
      order
    }
  },
  orders: { asc: "asc", desc: "desc" }
}

export const exclude = {
  options: { metadata: "metadata", totalRows: "totalRows", all: "metadata,totalRows" }
}
