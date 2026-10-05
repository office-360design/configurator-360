#!/usr/bin/env python3
"""Replace an SVG reference component with another SVG's geometry.

The output keeps the reference SVG's viewport/dimensions and places the input
geometry by finding the rigid alignment with the reference. The matcher tests:
  1. original orientation
  2. vertical mirror

It assumes the component variants share a substantial amount of identical
geometry and mainly differ in an arm/extension length.

Usage:
    python replace_svg_geometry.py REFERENCE.svg INPUT.svg OUTPUT.svg

Optional:
    --tolerance 0.001
    --debug
"""

from __future__ import annotations

import argparse
import copy
import math
import re
import sys
from collections import Counter
from pathlib import Path
import xml.etree.ElementTree as ET

NUMBER_RE = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")
PATH_TOKEN_RE = re.compile(
    r"[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?"
)
SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

PARAMS_PER_COMMAND = {
    "M": 2, "L": 2, "H": 1, "V": 1,
    "C": 6, "S": 4, "Q": 4, "T": 2,
    "A": 7, "Z": 0,
}


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def floats(value: str) -> list[float]:
    return [float(x) for x in NUMBER_RE.findall(value or "")]


def path_points(d: str) -> list[tuple[float, float]]:
    """Extract representative absolute points from an SVG path.

    Endpoints and control points are included. This is sufficient for matching
    CAD-exported paths and supports all standard SVG path commands.
    """
    tokens = PATH_TOKEN_RE.findall(d or "")
    points: list[tuple[float, float]] = []
    i = 0
    cmd: str | None = None
    cx = cy = 0.0
    sx = sy = 0.0

    def is_cmd(token: str) -> bool:
        return len(token) == 1 and token.isalpha()

    while i < len(tokens):
        if is_cmd(tokens[i]):
            cmd = tokens[i]
            i += 1
            if cmd.upper() == "Z":
                cx, cy = sx, sy
                points.append((cx, cy))
                cmd = None
                continue
        if cmd is None:
            raise ValueError("Malformed SVG path: number without command")

        upper = cmd.upper()
        relative = cmd.islower()
        needed = PARAMS_PER_COMMAND[upper]
        if i + needed > len(tokens):
            break
        vals = [float(v) for v in tokens[i:i + needed]]
        i += needed

        if upper == "M" or upper == "L" or upper == "T":
            x, y = vals
            if relative:
                x, y = cx + x, cy + y
            cx, cy = x, y
            if upper == "M":
                sx, sy = cx, cy
                # Subsequent coordinate pairs after M are implicit L commands.
                cmd = "l" if relative else "L"
            points.append((cx, cy))
        elif upper == "H":
            x = vals[0] + (cx if relative else 0.0)
            cx = x
            points.append((cx, cy))
        elif upper == "V":
            y = vals[0] + (cy if relative else 0.0)
            cy = y
            points.append((cx, cy))
        elif upper == "C":
            x1, y1, x2, y2, x, y = vals
            if relative:
                x1, y1, x2, y2, x, y = (
                    cx + x1, cy + y1, cx + x2, cy + y2, cx + x, cy + y
                )
            points.extend([(x1, y1), (x2, y2), (x, y)])
            cx, cy = x, y
        elif upper == "S" or upper == "Q":
            x1, y1, x, y = vals
            if relative:
                x1, y1, x, y = cx + x1, cy + y1, cx + x, cy + y
            points.extend([(x1, y1), (x, y)])
            cx, cy = x, y
        elif upper == "A":
            _rx, _ry, _rot, _large, _sweep, x, y = vals
            if relative:
                x, y = cx + x, cy + y
            points.append((x, y))
            cx, cy = x, y

        # Repeated parameter groups continue using the current command.
        if i < len(tokens) and is_cmd(tokens[i]):
            continue

    return points


def element_points(root: ET.Element) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for el in root.iter():
        tag = local_name(el.tag)
        if tag == "path":
            points.extend(path_points(el.get("d", "")))
        elif tag in {"polyline", "polygon"}:
            vals = floats(el.get("points", ""))
            points.extend(zip(vals[0::2], vals[1::2]))
        elif tag == "line":
            points.extend([
                (float(el.get("x1", 0)), float(el.get("y1", 0))),
                (float(el.get("x2", 0)), float(el.get("y2", 0))),
            ])
        elif tag == "rect":
            x, y = float(el.get("x", 0)), float(el.get("y", 0))
            w, h = float(el.get("width", 0)), float(el.get("height", 0))
            points.extend([(x, y), (x + w, y), (x, y + h), (x + w, y + h)])
        elif tag in {"circle", "ellipse"}:
            cx, cy = float(el.get("cx", 0)), float(el.get("cy", 0))
            rx = float(el.get("r", el.get("rx", 0)))
            ry = float(el.get("r", el.get("ry", 0)))
            points.extend([(cx - rx, cy), (cx + rx, cy), (cx, cy - ry), (cx, cy + ry)])
    if not points:
        raise ValueError("No supported geometry found in SVG")
    return points


def dedupe(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    seen: dict[tuple[int, int], tuple[float, float]] = {}
    for x, y in points:
        seen.setdefault((round(x / tolerance), round(y / tolerance)), (x, y))
    return list(seen.values())


def alignment_score(
    source: list[tuple[float, float]],
    target: list[tuple[float, float]],
    m11: int,
    m12: int,
    m21: int,
    m22: int,
    tx: float,
    ty: float,
    tolerance: float,
) -> int:
    grid = {(round(x / tolerance), round(y / tolerance)) for x, y in target}
    return sum(
        (round((m11 * x + m21 * y + tx) / tolerance), round((m12 * x + m22 * y + ty) / tolerance)) in grid
        for x, y in source
    )


def find_alignment(
    source: list[tuple[float, float]],
    target: list[tuple[float, float]],
    tolerance: float,
) -> tuple[int, int, int, int, float, float, int]:
    source = dedupe(source, tolerance)
    target = dedupe(target, tolerance)

    best: tuple[int, int, int, int, float, float, int] | None = None
    
    # 8 orthogonal matrices for combining 0/90/180/270 degree rotations and mirroring
    ORTHO_MATRICES = [
        (1, 0, 0, 1),
        (1, 0, 0, -1),
        (-1, 0, 0, 1),
        (-1, 0, 0, -1),
        (0, 1, 1, 0),
        (0, 1, -1, 0),
        (0, -1, 1, 0),
        (0, -1, -1, 0)
    ]

    for m11, m12, m21, m22 in ORTHO_MATRICES:
        offsets: Counter[tuple[int, int]] = Counter()
        for sx, sy0 in source:
            nx = m11 * sx + m21 * sy0
            ny = m12 * sx + m22 * sy0
            for tx0, ty0 in target:
                offsets[(round((tx0 - nx) / tolerance), round((ty0 - ny) / tolerance))] += 1

        # Evaluate several strongest candidates because repeated CAD details can
        # create local offset peaks.
        for (qx, qy), _votes in offsets.most_common(30):
            tx = qx * tolerance
            ty = qy * tolerance
            score = alignment_score(source, target, m11, m12, m21, m22, tx, ty, tolerance)
            candidate = (m11, m12, m21, m22, tx, ty, score)
            if best is None or score > best[6]:
                best = candidate

    assert best is not None
    return best


def read_svg(path: Path) -> tuple[ET.ElementTree, ET.Element]:
    tree = ET.parse(path)
    root = tree.getroot()
    if local_name(root.tag) != "svg":
        raise ValueError(f"{path} is not an SVG root document")
    return tree, root


def make_output(
    reference_root: ET.Element,
    input_root: ET.Element,
    m11: int,
    m12: int,
    m21: int,
    m22: int,
    tx: float,
    ty: float,
) -> ET.Element:
    # Keep all reference root attributes: viewBox, width, height, etc.
    output_root = ET.Element(reference_root.tag, dict(reference_root.attrib))

    # Keep reference definitions/metadata if present, but remove its drawable
    # component geometry.
    for child in reference_root:
        if local_name(child.tag) in {"defs", "metadata", "title", "desc", "style"}:
            output_root.append(copy.deepcopy(child))

    group = ET.SubElement(output_root, f"{{{SVG_NS}}}g")
    # SVG transform functions apply right-to-left. A matrix states the exact
    # desired mapping directly: x' = m11*x + m21*y + tx, y' = m12*x + m22*y + ty.
    group.set("transform", f"matrix({m11} {m12} {m21} {m22} {tx:.6f} {ty:.6f})")

    for child in input_root:
        if local_name(child.tag) not in {"defs", "metadata", "title", "desc", "style"}:
            group.append(copy.deepcopy(child))

    return output_root


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--tolerance", type=float, default=0.001)
    parser.add_argument("--threshold", type=float, default=0.20)
    parser.add_argument("--align-right", action="store_true")
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    try:
        _, reference_root = read_svg(args.reference)
        _, input_root = read_svg(args.input)
        reference_points = element_points(reference_root)
        input_points = element_points(input_root)
        m11, m12, m21, m22, tx, ty, score = find_alignment(input_points, reference_points, args.tolerance)

        if args.align_right:
            ref_maxX = max(x for x, y in reference_points)
            input_maxX = max(m11 * x + m21 * y for x, y in input_points)
            tx = ref_maxX - input_maxX

        min_count = min(len(dedupe(input_points, args.tolerance)), len(dedupe(reference_points, args.tolerance)))
        ratio = score / min_count if min_count else 0.0
        if ratio < args.threshold:
            raise ValueError(
                f"Low geometry match ({ratio:.1%}). The files may not be related components."
            )

        output_root = make_output(reference_root, input_root, m11, m12, m21, m22, tx, ty)
        ET.ElementTree(output_root).write(
            args.output, encoding="utf-8", xml_declaration=True
        )

        matrix_str = f"[{m11} {m12} {m21} {m22}]"
        print(
            f"Created {args.output}\n"
            f"Alignment Matrix: {matrix_str}, tx={tx:.6f}, ty={ty:.6f}, "
            f"matched={score}/{min_count} ({ratio:.1%})"
        )
        if args.debug:
            print(f"Reference points: {len(reference_points)}")
            print(f"Input points: {len(input_points)}")
        return 0
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
