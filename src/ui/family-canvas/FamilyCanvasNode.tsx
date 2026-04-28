import type { MouseEvent } from "react";
import { PhotoThumb } from "../PhotoThumb";
import {
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  initials,
  lifespanLabel,
  truncateLabel,
  type FamilyCanvasNode,
  type KinshipRole
} from "./canvasModel";

type FamilyCanvasNodeProps = {
  node: FamilyCanvasNode;
  isSelected: boolean;
  isDimmed: boolean;
  kinshipRole: KinshipRole | null;
  onClick: (event: MouseEvent<SVGGElement>) => void;
  onContextMenu: (event: MouseEvent<SVGGElement>) => void;
};

export function FamilyCanvasNodeView({
  node,
  isSelected,
  isDimmed,
  kinshipRole,
  onClick,
  onContextMenu
}: FamilyCanvasNodeProps) {
  const { person, badges } = node;
  const name = person.name || "Unnamed";
  const life = lifespanLabel(node.birthYear, node.deathYear);
  const badgeY = CANVAS_NODE_HEIGHT - 25;

  return (
    <g
      className={`family-node ${isSelected ? "selected" : ""} ${isDimmed ? "dimmed" : ""} ${kinshipRole ? `kin-${kinshipRole}` : ""}`}
      transform={`translate(${node.x - CANVAS_NODE_WIDTH / 2} ${node.y - CANVAS_NODE_HEIGHT / 2})`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      role="button"
      aria-label={name}
    >
      <title>
        {`${name}. Child of ${badges.parents}. Parent of ${badges.children}. Married with ${badges.spouses}. ${badges.events} events. ${badges.sources} sources.`}
      </title>
      <rect
        width={CANVAS_NODE_WIDTH}
        height={CANVAS_NODE_HEIGHT}
        rx={12}
        className="family-node-card"
      />
      {kinshipRole && kinshipRole !== "other" && (
        <rect
          x={0}
          y={0}
          width={5}
          height={CANVAS_NODE_HEIGHT}
          rx={12}
          className={`family-node-relation family-node-relation-${kinshipRole}`}
        />
      )}
      <rect
        x={0}
        y={0}
        width={CANVAS_NODE_WIDTH}
        height={5}
        rx={12}
        className={`family-node-stripe gender-${person.gender}`}
      />

      <foreignObject x={14} y={17} width={48} height={48}>
        <div className={`family-node-photo gender-${person.gender}`}>
          {person.photo ? (
            <PhotoThumb id={person.photo} alt={name} />
          ) : (
            <span>{initials(name)}</span>
          )}
        </div>
      </foreignObject>

      <text x={72} y={31} className="family-node-name">
        {truncateLabel(name, 18)}
      </text>
      <text x={72} y={50} className="family-node-life">
        {life}
      </text>

      <Badge x={14} y={badgeY} label="Child" value={badges.parents} />
      <Badge x={70} y={badgeY} label="Parent" value={badges.children} />
      <Badge x={133} y={badgeY} label="Married" value={badges.spouses} />

      <text x={14} y={CANVAS_NODE_HEIGHT - 7} className="family-node-evidence">
        {badges.events} events
        {badges.sources > 0 ? ` / ${badges.sources} sources` : ""}
      </text>
    </g>
  );
}

function Badge({ x, y, label, value }: { x: number; y: number; label: string; value: number }) {
  return (
    <g className={`family-node-badge ${value > 0 ? "active" : ""}`} transform={`translate(${x} ${y})`}>
      <rect width={label === "Married" ? 44 : 50} height={16} rx={8} />
      <text x={label === "Married" ? 22 : 25} y={11} textAnchor="middle">
        {label[0]} {value}
      </text>
    </g>
  );
}
