// Suporte para mecanismo de relógio
// Dimensões em mm

outer_diameter = 20.0;
inner_diameter = 10.2;
height = 10.0;

$fn = 128;

difference() {
    cylinder(d = outer_diameter, h = height);
    translate([0, 0, -0.1])
        cylinder(d = inner_diameter, h = height + 0.2);
}
