// Base parametrica para tubo quadrado de PVC 12 x 12 mm
// Unidades: mm
$fn = 96;

tubo_externo = 12;
folga_total = 0.1; // folga entre faces opostas
base_diametro = 70;
base_espessura = 6;
soquete_externo = 23;
soquete_altura = 18;
profundidade = 18;

module base_tubo() {
    difference() {
        union() {
            cylinder(d=base_diametro, h=base_espessura);
            translate([0,0,base_espessura])
                linear_extrude(height=soquete_altura)
                    offset(r=2) square([soquete_externo-4,soquete_externo-4], center=true);
        }
        // Encaixe cego: deixa a espessura da base intacta
        translate([0,0,base_espessura+soquete_altura-profundidade])
            cube([tubo_externo+folga_total,tubo_externo+folga_total,profundidade+0.1],center=false);
    }
}
// Centraliza abertura no soquete
module base_final() {
    difference() {
        union() {
            cylinder(d=base_diametro, h=base_espessura);
            translate([0,0,base_espessura])
                linear_extrude(height=soquete_altura)
                    offset(r=2) square([soquete_externo-4,soquete_externo-4], center=true);
        }
        translate([-(tubo_externo+folga_total)/2,-(tubo_externo+folga_total)/2,base_espessura+soquete_altura-profundidade])
            cube([tubo_externo+folga_total,tubo_externo+folga_total,profundidade+0.2]);
    }
}
base_final();
