export default function renderIcon (block) {
  if (block.parent) {
    console.error('Only top most block can render front icon button.')
  }
  return null
}
