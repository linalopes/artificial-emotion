// Abracadeira em U para tubo PVC - versao com fundo de apoio
// Encosta no painel de madeira em y=0; madeira fecha a abertura lateral.
// Disco no plano z=0 fecha uma extremidade axial, sustentando o tubo vertical.
// Unidades: mm. Imprimir 1 unidade para teste.
// Apoio para tubo vertical; orientar a base para baixo na montagem.

// 36 mm interno + 2 x 2 mm de parede = 40 mm externo.
diametro_tubo = 40;
folga_diametral = 0;  // encaixe nominal justo (ajustar se necessario)
espessura_anel = 5;
largura_peca = 16;  // faixa ao longo do tubo
espessura_aba = 6; // distancia da madeira ate a face superior da aba
comprimento_aba_externa = 44; // limite externo em x, a cada lado
inicio_aba = 14;    // sobrepoe e funde com a curva
angulo_inicio = -45;
angulo_fim = 225;   // 270 graus: envolve 3/4 do tubo
furo_parafuso = 3.2; // para parafuso de madeira de 3 mm
posicao_furo = 34;  // x do centro de cada furo
segmentos = 180;
espessura_fundo = 4; // base interna de apoio do tubo

raio_interno = (diametro_tubo + folga_diametral)/2;
raio_externo = raio_interno + espessura_anel;
centro_y = raio_interno;  // tubo tangencia madeira (plano y=0)

function arco(r, a, b, n) =
    [for(i=[0:n]) [r*cos(a+(b-a)*i/n), centro_y+r*sin(a+(b-a)*i/n)]];

module faixa_curva_2d() {
    polygon(concat(
       arco(raio_externo, angulo_inicio, angulo_fim, segmentos),
       arco(raio_interno, angulo_fim, angulo_inicio, segmentos)
    ));
}

module perfil_2d() {
    difference() {
        union() {
            faixa_curva_2d();
            translate([inicio_aba,0])
                square([comprimento_aba_externa-inicio_aba, espessura_aba]);
            translate([-comprimento_aba_externa,0])
                square([comprimento_aba_externa-inicio_aba, espessura_aba]);
        }
        // Garante que as abas nao invadam a area circular do tubo.
        translate([0,centro_y]) circle(r=raio_interno, $fn=360);
    }
}

// A madeira fica no plano y=0. O eixo dos parafusos e perpendicular
// a madeira (eixo y). Cada furo atravessa uma aba de 6 mm.
difference() {
    union() {
        linear_extrude(height=largura_peca) perfil_2d();
        // Tampa circular na extremidade z=0: ultrapassa 0,4 mm
        // o raio interior para fundir-se firmemente ao U.
        translate([0,centro_y,0])
            cylinder(r=raio_interno+0.4,h=espessura_fundo,$fn=240);
    }
    for (x=[-posicao_furo, posicao_furo]) {
        translate([x,espessura_aba/2,largura_peca/2])
            rotate([90,0,0])
                cylinder(d=furo_parafuso,h=espessura_aba+2,center=true,$fn=40);
    }
}
