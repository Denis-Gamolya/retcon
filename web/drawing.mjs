/** Find connected pixels as horizontal spans, without recursive stack growth. */
export function fillSpans(pixels, width, height, x, y, limit = 12000) {
  x = Math.max(0, Math.min(width - 1, Math.floor(x)));
  y = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const origin = (y * width + x) * 4;
  const target = pixels.slice(origin, origin + 4);
  const visited = new Uint8Array(width * height);
  const pending = [[x, y]];
  const spans = [];
  function matches(column, row) {
    const index = row * width + column;
    return !visited[index] && target.every((channel, offset) =>
      Math.abs(pixels[index * 4 + offset] - channel) <= 28);
  }
  while (pending.length) {
    const [column, row] = pending.pop();
    if (!matches(column, row)) continue;
    let left = column;
    let right = column;
    while (left > 0 && matches(left - 1, row)) left--;
    while (right + 1 < width && matches(right + 1, row)) right++;
    spans.push([row, left, right + 1]);
    if (spans.length > limit) throw new Error('This area is too complex to fill.');
    for (let index = left; index <= right; index++) visited[row * width + index] = 1;
    for (const neighbor of [row - 1, row + 1]) {
      if (neighbor < 0 || neighbor >= height) continue;
      let inside = false;
      for (let index = left; index <= right; index++) {
        const match = matches(index, neighbor);
        if (match && !inside) pending.push([index, neighbor]);
        inside = match;
      }
    }
  }
  return spans;
}

/** Replay a brush stroke or a bucket fill on the shared drawing surface. */
export function drawStroke(context, stroke) {
  context.save();
  context.globalAlpha = stroke.opacity ?? 1;
  context.fillStyle = stroke.color;
  if (stroke.type === 'fill') {
    for (const [row, left, right] of stroke.spans) {
      context.fillRect(left, row, right - left, 1);
    }
  } else {
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    if (stroke.points.length === 1) {
      context.arc(...stroke.points[0], stroke.width / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.moveTo(...stroke.points[0]);
      for (const point of stroke.points.slice(1)) context.lineTo(...point);
      context.stroke();
    }
  }
  context.restore();
}
