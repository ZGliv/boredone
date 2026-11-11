export function sheetDragAction({dx=0,dy=0,elapsed=1,expanded=false}){
 if(Math.abs(dx)>Math.abs(dy))return 'stay';
 if(dy>90 || (dy>35 && dy/Math.max(1,elapsed)>.55))return expanded?'collapse':'dismiss';
 if(dy < -45)return 'expand';
 return 'stay';
}
