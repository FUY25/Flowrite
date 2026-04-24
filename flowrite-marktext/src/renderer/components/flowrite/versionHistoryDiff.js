const toLines = markdown => {
  if (typeof markdown !== 'string' || markdown.length === 0) {
    return []
  }

  return markdown.replace(/\r\n?/g, '\n').split('\n')
}

export const buildVersionHistoryDiff = (previousMarkdown = '', nextMarkdown = '') => {
  const previousLines = toLines(previousMarkdown)
  const nextLines = toLines(nextMarkdown)
  const rowCount = previousLines.length
  const columnCount = nextLines.length
  const matrix = Array.from({ length: rowCount + 1 }, () => Array(columnCount + 1).fill(0))

  for (let row = rowCount - 1; row >= 0; row -= 1) {
    for (let column = columnCount - 1; column >= 0; column -= 1) {
      if (previousLines[row] === nextLines[column]) {
        matrix[row][column] = matrix[row + 1][column + 1] + 1
      } else {
        matrix[row][column] = Math.max(matrix[row + 1][column], matrix[row][column + 1])
      }
    }
  }

  const diff = []
  let row = 0
  let column = 0

  while (row < rowCount && column < columnCount) {
    if (previousLines[row] === nextLines[column]) {
      diff.push({ type: 'context', marker: ' ', text: previousLines[row] })
      row += 1
      column += 1
      continue
    }

    if (matrix[row + 1][column] >= matrix[row][column + 1]) {
      diff.push({ type: 'remove', marker: '−', text: previousLines[row] })
      row += 1
      continue
    }

    diff.push({ type: 'add', marker: '+', text: nextLines[column] })
    column += 1
  }

  while (row < rowCount) {
    diff.push({ type: 'remove', marker: '−', text: previousLines[row] })
    row += 1
  }

  while (column < columnCount) {
    diff.push({ type: 'add', marker: '+', text: nextLines[column] })
    column += 1
  }

  return diff
}

export default buildVersionHistoryDiff
