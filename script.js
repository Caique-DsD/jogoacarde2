const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = 480;
canvas.height = 640;

const LARGURA = canvas.width;
const ALTURA = canvas.height;

// CORES
const BRANCO = "#ffffff";
const AZUL = "#00bfff";
const VERMELHO = "#ff2b2b";
const VERDE = "#00ff99";
const AMARELO = "#ffe600";

// ESTADOS
const MENU = 0;
const JOGO = 1;
const LOJA = 2;
const GAMEOVER = 3;

let estado = MENU;

// VARIÁVEIS
let fase = 1;
let pontuacao = 0;
let dinheiro = 0;

let teclas = {};

let tiros = [];
let asteroides = [];
let explosoes = [];
let particulas = [];

// IMAGENS
const naveImg = new Image();
naveImg.src = "img/foguete.png";

const asteroideImg = new Image();
asteroideImg.src = "img/asteroide.png";

// ESTRELAS
const estrelas = [];

for(let i=0;i<120;i++){

    estrelas.push({

        x:Math.random()*LARGURA,
        y:Math.random()*ALTURA,
        r:Math.random()*2+1,
        vel:Math.random()*3+1
    });
}

function desenharEstrelas(){

    estrelas.forEach((e)=>{

        ctx.beginPath();

        ctx.fillStyle = "white";

        ctx.arc(e.x,e.y,e.r,0,Math.PI*2);

        ctx.fill();

        e.y += e.vel;

        if(e.y > ALTURA){

            e.y = 0;
            e.x = Math.random()*LARGURA;
        }
    });
}

// PARTÍCULAS
class Particula{

    constructor(x,y){

        this.x = x;
        this.y = y;

        this.raio = Math.random()*3+1;

        this.velX = (Math.random()-0.5)*6;
        this.velY = (Math.random()-0.5)*6;

        this.alpha = 1;
    }

    update(){

        this.x += this.velX;
        this.y += this.velY;

        this.alpha -= 0.03;
    }

    desenhar(){

        ctx.save();

        ctx.globalAlpha = this.alpha;

        ctx.fillStyle = "#ff9900";

        ctx.beginPath();

        ctx.arc(this.x,this.y,this.raio,0,Math.PI*2);

        ctx.fill();

        ctx.restore();
    }
}

// NAVE
class Nave{

    constructor(){

        this.x = LARGURA/2 - 35;
        this.y = ALTURA - 100;

        this.tamanho = 70;

        this.vel = 6;

        this.vida = 3;
        this.vidaMax = 3;

        this.cooldown = 0;

        this.tiroDuplo = false;
        this.tiroRapido = false;
    }

    mover(){

        if(teclas["a"] || teclas["arrowleft"]){

            this.x -= this.vel;
        }

        if(teclas["d"] || teclas["arrowright"]){

            this.x += this.vel;
        }

        if(this.x < 0){

            this.x = 0;
        }

        if(this.x > LARGURA - this.tamanho){

            this.x = LARGURA - this.tamanho;
        }
    }

    atirar(){

        if(this.cooldown <= 0){

            tiros.push(
                new Tiro(
                    this.x + this.tamanho/2 - 3,
                    this.y
                )
            );

            if(this.tiroDuplo){

                tiros.push(new Tiro(this.x + 10,this.y));

                tiros.push(
                    new Tiro(
                        this.x + this.tamanho - 15,
                        this.y
                    )
                );
            }

            this.cooldown = this.tiroRapido ? 6 : 14;
        }
    }

    update(){

        if(this.cooldown > 0){

            this.cooldown--;
        }
    }

    desenhar(){

        ctx.save();

        ctx.shadowColor = "#00bfff";
        ctx.shadowBlur = 25;

        ctx.drawImage(
            naveImg,
            this.x,
            this.y,
            this.tamanho,
            this.tamanho
        );

        ctx.restore();
    }
}

// ASTEROIDE
class Asteroide{

    constructor(){

        this.tamanho = Math.random()*40+40;

        this.resetar();
    }

    resetar(){

        this.x = Math.random()*(LARGURA-this.tamanho);

        this.y = Math.random()*-500;

        this.vel = Math.random()*3+2+fase*0.4;

        this.rotacao = 0;
    }

    mover(){

        this.y += this.vel;

        this.rotacao += 0.02;

        if(this.y > ALTURA){

            this.resetar();
        }
    }

    desenhar(){

        ctx.save();

        ctx.translate(
            this.x + this.tamanho/2,
            this.y + this.tamanho/2
        );

        ctx.rotate(this.rotacao);

        ctx.drawImage(
            asteroideImg,
            -this.tamanho/2,
            -this.tamanho/2,
            this.tamanho,
            this.tamanho
        );

        ctx.restore();
    }
}

// TIRO
class Tiro{

    constructor(x,y){

        this.x = x;
        this.y = y;

        this.largura = 5;
        this.altura = 18;

        this.vel = 12;
    }

    mover(){

        this.y -= this.vel;
    }

    desenhar(){

        ctx.save();

        ctx.shadowColor = "#ffe600";
        ctx.shadowBlur = 20;

        ctx.fillStyle = "#ffe600";

        ctx.fillRect(
            this.x,
            this.y,
            this.largura,
            this.altura
        );

        ctx.restore();
    }
}

// EXPLOSÃO
class Explosao{

    constructor(x,y){

        this.x = x;
        this.y = y;

        this.raio = 10;

        this.alpha = 1;
    }

    update(){

        this.raio += 3;

        this.alpha -= 0.05;
    }

    desenhar(){

        ctx.save();

        ctx.globalAlpha = this.alpha;

        ctx.strokeStyle = "#ff6600";

        ctx.lineWidth = 4;

        ctx.beginPath();

        ctx.arc(
            this.x,
            this.y,
            this.raio,
            0,
            Math.PI*2
        );

        ctx.stroke();

        ctx.restore();
    }
}

// RESET
function resetarJogo(){

    fase = 1;
    pontuacao = 0;
    dinheiro = 0;

    tiros = [];
    asteroides = [];
    explosoes = [];
    particulas = [];

    nave = new Nave();

    for(let i=0;i<5;i++){

        asteroides.push(
            new Asteroide()
        );
    }
}

let nave = new Nave();

resetarJogo();

// COLISÃO
function colisao(a,b){

    return(

        a.x < b.x + b.tamanho &&
        a.x + a.tamanho > b.x &&
        a.y < b.y + b.tamanho &&
        a.y + a.tamanho > b.y
    );
}

// TECLAS
document.addEventListener("keydown",(e)=>{

    teclas[e.key.toLowerCase()] = true;

    if(estado === MENU){

        if(e.key === "Enter"){

            estado = JOGO;
        }

        if(e.key.toLowerCase() === "l"){

            estado = LOJA;
        }
    }

    if(estado === JOGO){

        if(e.key === " "){

            nave.atirar();
        }
    }

    if(estado === LOJA){

        if(e.key === "1" && dinheiro >= 50){

            nave.vel += 1;
            dinheiro -= 50;
        }

        if(e.key === "2" && dinheiro >= 80){

            nave.tiroDuplo = true;
            dinheiro -= 80;
        }

        if(e.key === "3" && dinheiro >= 70){

            nave.tiroRapido = true;
            dinheiro -= 70;
        }

        if(e.key === "4" && dinheiro >= 60){

            nave.vida++;
            nave.vidaMax++;

            dinheiro -= 60;
        }

        if(e.key === "Escape"){

            estado = MENU;
        }
    }

    if(estado === GAMEOVER){

        if(e.key === "Enter"){

            resetarJogo();

            estado = MENU;
        }
    }
});

document.addEventListener("keyup",(e)=>{

    teclas[e.key.toLowerCase()] = false;
});
// CLIQUE DO MOUSE
canvas.addEventListener("mousedown",(e)=>{

    if(estado === JOGO){

        // botão esquerdo
        if(e.button === 0){

            nave.atirar();
        }
    }
});
// BARRA VIDA
function desenharVida(){

    ctx.fillStyle = "#400";

    ctx.fillRect(15,15,140,20);

    ctx.fillStyle = "#00ff99";

    ctx.fillRect(
        15,
        15,
        (nave.vida/nave.vidaMax)*140,
        20
    );
}

// TEXTO GLOW
function textoGlow(texto,x,y,tamanho,cor){

    ctx.save();

    ctx.font = `${tamanho}px Arial`;

    ctx.fillStyle = cor;

    ctx.shadowColor = cor;
    ctx.shadowBlur = 20;

    ctx.fillText(texto,x,y);

    ctx.restore();
}

// LOOP
function loop(){

    ctx.clearRect(0,0,LARGURA,ALTURA);

    desenharEstrelas();

    // MENU
    if(estado === MENU){

        textoGlow(
            "ARCADE SHOOTER",
            25,
            160,
            40,
            "#00bfff"
        );

        textoGlow(
            "PRO+",
            175,
            210,
            32,
            "#00ff99"
        );

        ctx.drawImage(
            naveImg,
            190,
            250,
            100,
            100
        );

        textoGlow(
            "ENTER - JOGAR",
            105,
            420,
            24,
            "#ffffff"
        );

        textoGlow(
            "L - LOJA",
            155,
            470,
            24,
            "#ffe600"
        );
    }

    // LOJA
    else if(estado === LOJA){

        textoGlow(
            "LOJA",
            155,
            120,
            45,
            "#ffe600"
        );

        ctx.font = "22px Arial";

        ctx.fillStyle = BRANCO;

        const itens = [

            "1 - Velocidade (+1) = 50",
            "2 - Tiro Duplo = 80",
            "3 - Tiro Rapido = 70",
            "4 - Vida Extra = 60",
            "ESC - Voltar"
        ];

        itens.forEach((item,i)=>{

            ctx.fillText(
                item,
                55,
                220 + i*55
            );
        });

        textoGlow(
            `Dinheiro: $${dinheiro}`,
            120,
            560,
            28,
            "#00ff99"
        );
    }

    // GAME OVER
    else if(estado === GAMEOVER){

        textoGlow(
            "GAME OVER",
            65,
            280,
            52,
            "#ff2b2b"
        );

        textoGlow(
            `Pontos: ${pontuacao}`,
            120,
            360,
            30,
            "#ffffff"
        );

        textoGlow(
            "ENTER PARA REINICIAR",
            40,
            450,
            26,
            "#ffe600"
        );
    }

    // JOGO
    else if(estado === JOGO){

        nave.mover();
        nave.update();
        nave.desenhar();

        // TIROS
        tiros.forEach((tiro,index)=>{

            tiro.mover();
            tiro.desenhar();

            if(tiro.y < -20){

                tiros.splice(index,1);
            }
        });

        // ASTEROIDES
        asteroides.forEach((ast)=>{

            ast.mover();
            ast.desenhar();

            // NAVE
            if(colisao({

                x:nave.x,
                y:nave.y,
                tamanho:nave.tamanho

            },ast)){

                nave.vida--;

                explosoes.push(
                    new Explosao(
                        nave.x+35,
                        nave.y+35
                    )
                );

                ast.resetar();

                if(nave.vida <= 0){

                    estado = GAMEOVER;
                }
            }

            // TIRO
            tiros.forEach((tiro,index)=>{

                if(

                    tiro.x < ast.x + ast.tamanho &&
                    tiro.x + tiro.largura > ast.x &&
                    tiro.y < ast.y + ast.tamanho &&
                    tiro.y + tiro.altura > ast.y
                ){

                    tiros.splice(index,1);

                    pontuacao += 10;

                    dinheiro += 5;

                    explosoes.push(

                        new Explosao(
                            ast.x + ast.tamanho/2,
                            ast.y + ast.tamanho/2
                        )
                    );

                    for(let i=0;i<12;i++){

                        particulas.push(

                            new Particula(
                                ast.x + ast.tamanho/2,
                                ast.y + ast.tamanho/2
                            )
                        );
                    }

                    ast.resetar();
                }
            });
        });

        // EXPLOSÕES
        explosoes.forEach((exp,index)=>{

            exp.update();
            exp.desenhar();

            if(exp.alpha <= 0){

                explosoes.splice(index,1);
            }
        });

        // PARTÍCULAS
        particulas.forEach((p,index)=>{

            p.update();
            p.desenhar();

            if(p.alpha <= 0){

                particulas.splice(index,1);
            }
        });

        // FASES
        if(pontuacao >= fase*200){

            fase++;

            asteroides.push(
                new Asteroide()
            );
        }

        // HUD
        desenharVida();

        textoGlow(
            `Pontos: ${pontuacao}`,
            15,
            60,
            22,
            "#ffffff"
        );

        textoGlow(
            `Dinheiro: $${dinheiro}`,
            15,
            90,
            22,
            "#00ff99"
        );

        textoGlow(
            `Fase: ${fase}`,
            15,
            120,
            22,
            "#00bfff"
        );
    }

    requestAnimationFrame(loop);
}

loop();
