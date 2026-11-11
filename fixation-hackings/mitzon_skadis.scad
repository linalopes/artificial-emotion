// MITTZON x SKADIS — true 90-degree L bracket, V3 — MITTZON clearance Ø6.2 mm
// Units: mm. X = toward panel centre, Y = front/back depth, Z = vertical.
// MITTZON inner fixing face: X=0. Screw centres: Y=+/-18, Z=+/-5.
// SKADIS panel: X=20..780, Y=-2.5..+2.5, thickness 5.
// Left bracket: board slot centres X=40 or 60 (from MITTZON fixing line).
// Note: verify MITTZON screw axis and actual fixing-face position before load use.
$fn=48;
mode="assembly"; // "assembly", "front", "back", "print_front", "print_back"
frame_hole_depth=36;
panel_thickness=5;
panel_width=760;
frame_fixing_span=800;
frame_hole_pitch=10;
frame_screw_clearance=6.2;
panel_bolt_clearance=5.4; // M5 bolt through 6 mm SKADIS slot
wall=5;
bracket_height=30;
mount_flange_depth=26; // covers Y=2.5..28.5, holes at Y=18
reach=72;
slot_first=40;
slot_second=60;
mount_y=frame_hole_depth/2;
board_y=panel_thickness/2;

module capsule_x(xa,xb,d,h) {
  hull(){ translate([xa,0,0]) cylinder(d=d,h=h,center=true);
          translate([xb,0,0]) cylinder(d=d,h=h,center=true); }
}

// Front (+Y): mounting flange plane YZ; arm plane XZ. Orthogonal 90-degree L.
module bracket_front() {
 difference(){
  union(){
   // Fixing flange against frame's inward-facing vertical surface X=0
   translate([wall/2,board_y+mount_flange_depth/2,0]) cube([wall,mount_flange_depth,bracket_height],center=true);
   // Board arm, contact face at Y=+2.5
   translate([reach/2,board_y+wall/2,0]) cube([reach,wall,bracket_height],center=true);
  }
  // Two MITTZON clearance holes through X-axis, vertically spaced 10 mm
  for(z=[-frame_hole_pitch/2,frame_hole_pitch/2])
   translate([wall/2,mount_y,z]) rotate([0,90,0]) cylinder(d=frame_screw_clearance,h=wall+2,center=true);
  // Horizontal slot, M5 through Y axis, centre from X=40 to X=60
  translate([0,board_y+wall/2,0]) rotate([90,0,0]) capsule_x(slot_first,slot_second,panel_bolt_clearance,wall+2);
 }
}
module bracket_back(){mirror([0,1,0]) bracket_front();}
module panel_preview(){
 color([0.75,0.82,0.82,0.45])
 translate([frame_fixing_span/2,0,0]) cube([panel_width,panel_thickness,100],center=true);
}
module assembly(){
 panel_preview();
 color([0.55,0.28,0.85]) bracket_front();
 color([0.35,0.20,0.65]) bracket_back();
 color([0.55,0.28,0.85]) translate([frame_fixing_span,0,0]) mirror([1,0,0]) bracket_front();
 color([0.35,0.20,0.65]) translate([frame_fixing_span,0,0]) mirror([1,0,0]) bracket_back();
 // MITTZON screw centre markers
 for(x=[0,frame_fixing_span],y=[-mount_y,mount_y],z=[-5,5])
 color([0.9,0.55,0.12]) translate([x,y,z]) sphere(d=2);
}
if(mode=="assembly") assembly();
else if(mode=="front" || mode=="print_front") bracket_front();
else if(mode=="back" || mode=="print_back") bracket_back();
