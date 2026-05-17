import pygame
import random
import os

# =========================
# INICIAR
# =========================
pygame.init()
pygame.mixer.init()

# =========================
# CONFIGURAÇÕES
# =========================
LARGURA = 480
ALTURA = 640
FPS = 60

tela = pygame.display.set_mode((LARGURA, ALTURA))
pygame.display.set_caption("Arcade Shooter PRO+")

clock = pygame.time.Clock()

# =========================
# FONTES
# =========================
fonte = pygame.font.SysFont("Arial", 22)
fonte_pequena = pygame.font.SysFont("Arial", 18)
titulo_fonte = pygame.font.SysFont("Arial", 42, bold=True)

# =========================
# CORES
# =========================
BRANCO = (255, 255, 255)
PRETO = (0, 0, 0)
VERMELHO = (255, 0, 0)
VERDE = (0, 255, 0)
AZUL = (0, 180, 255)
AMARELO = (255, 255, 0)

# =========================
# FUNÇÃO CARREGAR IMAGEM
# =========================
def carregar_imagem(caminho, tamanho, cor):

    if os.path.exists(caminho):

        img = pygame.image.load(caminho).convert_alpha()

        img = pygame.transform.scale(img, tamanho)

        return img

    else:

        superficie = pygame.Surface(tamanho, pygame.SRCALPHA)

        pygame.draw.polygon(
            superficie,
            cor,
            [
                (tamanho[0] // 2, 0),
                (0, tamanho[1]),
                (tamanho[0], tamanho[1]),
            ],
        )

        return superficie


# =========================
# IMAGENS
# =========================
nave_img = carregar_imagem(
    "foguete.png",
    (60, 60),
    AZUL,
)

asteroide_img = carregar_imagem(
    "asteroide.png",
    (60, 60),
    (120, 120, 120),
)

# =========================
# MÚSICA
# =========================
# coloque um arquivo chamado:
# musica.mp3
# na mesma pasta do jogo

if os.path.exists("musica.mp3"):

    pygame.mixer.music.load("musica.mp3")

    pygame.mixer.music.set_volume(0.5)

    pygame.mixer.music.play(-1, fade_ms=3000)

# =========================
# ESTADOS
# =========================
MENU = 0
JOGO = 1
LOJA = 2
GAME_OVER = 3

estado = MENU

# =========================
# ESTRELAS
# =========================
estrelas = []

for _ in range(100):

    estrelas.append(
        [
            random.randint(0, LARGURA),
            random.randint(0, ALTURA),
            random.randint(1, 3),
        ]
    )


def desenhar_estrelas():

    for estrela in estrelas:

        pygame.draw.circle(
            tela,
            BRANCO,
            (estrela[0], estrela[1]),
            estrela[2],
        )

        estrela[1] += estrela[2]

        if estrela[1] > ALTURA:

            estrela[0] = random.randint(0, LARGURA)

            estrela[1] = 0


# =========================
# CLASSES
# =========================
class Nave:

    def __init__(self):

        self.x = LARGURA // 2 - 30
        self.y = ALTURA - 90

        self.vel = 6

        self.tamanho = 60

        self.vida_max = 3
        self.vida = 3

        self.cooldown = 0

        self.tiro_duplo = False
        self.tiro_rapido = False

    def mover(self, teclas):

        if teclas[pygame.K_a] or teclas[pygame.K_LEFT]:
            self.x -= self.vel

        if teclas[pygame.K_d] or teclas[pygame.K_RIGHT]:
            self.x += self.vel

        if self.x < 0:
            self.x = 0

        if self.x > LARGURA - self.tamanho:
            self.x = LARGURA - self.tamanho

    def atirar(self, tiros):

        if self.cooldown == 0:

            tiros.append(
                Tiro(
                    self.x + self.tamanho // 2 - 2,
                    self.y,
                )
            )

            if self.tiro_duplo:

                tiros.append(Tiro(self.x + 10, self.y))

                tiros.append(
                    Tiro(
                        self.x + self.tamanho - 10,
                        self.y,
                    )
                )

            self.cooldown = 8 if self.tiro_rapido else 18

    def update(self):

        if self.cooldown > 0:
            self.cooldown -= 1

    def desenhar(self, teclas):

        img = nave_img

        if teclas[pygame.K_a] or teclas[pygame.K_LEFT]:

            img = pygame.transform.rotate(
                nave_img,
                15,
            )

        elif teclas[pygame.K_d] or teclas[pygame.K_RIGHT]:

            img = pygame.transform.rotate(
                nave_img,
                -15,
            )

        tela.blit(img, (self.x, self.y))


class Asteroide:

    def __init__(self, fase):

        self.tamanho = random.randint(40, 70)

        self.x = random.randint(
            0,
            LARGURA - self.tamanho,
        )

        self.y = random.randint(-300, -40)

        self.vel = random.randint(2, 4) + fase * 0.3

    def mover(self):

        self.y += self.vel

        if self.y > ALTURA:
            self.resetar()

    def resetar(self):

        self.x = random.randint(
            0,
            LARGURA - self.tamanho,
        )

        self.y = random.randint(-300, -40)

    def desenhar(self):

        img = pygame.transform.scale(
            asteroide_img,
            (self.tamanho, self.tamanho),
        )

        tela.blit(img, (self.x, self.y))


class Tiro:

    def __init__(self, x, y):

        self.x = x
        self.y = y

        self.vel = 10

    def mover(self):

        self.y -= self.vel

    def desenhar(self):

        pygame.draw.rect(
            tela,
            AMARELO,
            (self.x, self.y, 4, 12),
        )


class Explosao:

    def __init__(self, x, y):

        self.x = x
        self.y = y

        self.raio = 5

        self.tempo = 20

    def update(self):

        self.raio += 2

        self.tempo -= 1

    def desenhar(self):

        pygame.draw.circle(
            tela,
            (255, 120, 0),
            (int(self.x), int(self.y)),
            self.raio,
            2,
        )


# =========================
# FUNÇÕES
# =========================
def colisao(x1, y1, t1, x2, y2, t2):

    return (
        x1 < x2 + t2
        and x1 + t1 > x2
        and y1 < y2 + t2
        and y1 + t1 > y2
    )


def reset(fase):

    nave = Nave()

    tiros = []

    explosoes = []

    asteroides = []

    for _ in range(5 + fase):

        asteroides.append(
            Asteroide(fase)
        )

    return nave, tiros, asteroides, explosoes


def desenhar_barra_vida(
    vida,
    vida_max,
):

    largura_total = 120

    pygame.draw.rect(
        tela,
        VERMELHO,
        (10, 10, largura_total, 18),
    )

    largura_vida = (
        vida / vida_max
    ) * largura_total

    pygame.draw.rect(
        tela,
        VERDE,
        (10, 10, largura_vida, 18),
    )


def desenhar_menu(opcao):

    titulo = titulo_fonte.render(
        "ARCADE SHOOTER",
        True,
        AZUL,
    )

    tela.blit(titulo, (45, 120))

    tela.blit(nave_img, (210, 210))

    cor1 = AMARELO if opcao == 0 else BRANCO
    cor2 = AMARELO if opcao == 1 else BRANCO

    texto1 = fonte.render(
        "JOGAR",
        True,
        cor1,
    )

    texto2 = fonte.render(
        "LOJA",
        True,
        cor2,
    )

    tela.blit(texto1, (200, 350))
    tela.blit(texto2, (210, 390))


# =========================
# VARIÁVEIS
# =========================
fase = 1

pontuacao = 0

dinheiro = 0

nave, tiros, asteroides, explosoes = reset(fase)

opcao_menu = 0

# =========================
# LOOP PRINCIPAL
# =========================
rodando = True

while rodando:

    clock.tick(FPS)

    tela.fill(PRETO)

    desenhar_estrelas()

    # =========================
    # EVENTOS
    # =========================
    for evento in pygame.event.get():

        if evento.type == pygame.QUIT:
            rodando = False

        if evento.type == pygame.KEYDOWN:

            # MENU
            if estado == MENU:

                if evento.key == pygame.K_UP:
                    opcao_menu = (opcao_menu - 1) % 2

                if evento.key == pygame.K_DOWN:
                    opcao_menu = (opcao_menu + 1) % 2

                if evento.key == pygame.K_RETURN:

                    if opcao_menu == 0:
                        estado = JOGO

                    else:
                        estado = LOJA

            # LOJA
            elif estado == LOJA:

                if evento.key == pygame.K_1 and dinheiro >= 50:

                    nave.vel += 1

                    dinheiro -= 50

                if evento.key == pygame.K_2 and dinheiro >= 80:

                    nave.tiro_duplo = True

                    dinheiro -= 80

                if evento.key == pygame.K_3 and dinheiro >= 70:

                    nave.tiro_rapido = True

                    dinheiro -= 70

                if evento.key == pygame.K_4 and dinheiro >= 60:

                    nave.vida += 1

                    nave.vida_max += 1

                    dinheiro -= 60

                if evento.key == pygame.K_ESCAPE:
                    estado = MENU

            # GAME OVER
            elif estado == GAME_OVER:

                if evento.key == pygame.K_RETURN:

                    fase = 1
                    pontuacao = 0
                    dinheiro = 0

                    nave, tiros, asteroides, explosoes = reset(fase)

                    estado = MENU

        # TIRO
        if estado == JOGO:

            if evento.type == pygame.MOUSEBUTTONDOWN:

                if evento.button == 1:
                    nave.atirar(tiros)

            if evento.type == pygame.KEYDOWN:

                if evento.key == pygame.K_SPACE:
                    nave.atirar(tiros)

    # =========================
    # MENU
    # =========================
    if estado == MENU:

        desenhar_menu(opcao_menu)

    # =========================
    # JOGO
    # =========================
    elif estado == JOGO:

        teclas = pygame.key.get_pressed()

        nave.mover(teclas)

        nave.update()

        # TIROS
        for tiro in tiros[:]:

            tiro.mover()

            if tiro.y < -20:
                tiros.remove(tiro)

        # ASTEROIDES
        for ast in asteroides:

            ast.mover()

            # COLISÃO COM NAVE
            if colisao(
                nave.x,
                nave.y,
                nave.tamanho,
                ast.x,
                ast.y,
                ast.tamanho,
            ):

                nave.vida -= 1

                explosoes.append(
                    Explosao(
                        nave.x + 30,
                        nave.y + 30,
                    )
                )

                ast.resetar()

                if nave.vida <= 0:
                    estado = GAME_OVER

        # COLISÃO TIRO
        for ast in asteroides:

            for tiro in tiros[:]:

                if colisao(
                    tiro.x,
                    tiro.y,
                    5,
                    ast.x,
                    ast.y,
                    ast.tamanho,
                ):

                    if tiro in tiros:
                        tiros.remove(tiro)

                    explosoes.append(
                        Explosao(
                            ast.x + ast.tamanho // 2,
                            ast.y + ast.tamanho // 2,
                        )
                    )

                    ast.resetar()

                    pontuacao += 10

                    dinheiro += 5

        # SISTEMA DE FASES
        if pontuacao >= fase * 200:

            fase += 1

            asteroides.append(
                Asteroide(fase)
            )

        # DESENHAR
        nave.desenhar(teclas)

        for tiro in tiros:
            tiro.desenhar()

        for ast in asteroides:
            ast.desenhar()

        for exp in explosoes[:]:

            exp.update()

            exp.desenhar()

            if exp.tempo <= 0:
                explosoes.remove(exp)

        # HUD
        desenhar_barra_vida(
            nave.vida,
            nave.vida_max,
        )

        tela.blit(
            fonte_pequena.render(
                f"Pontos: {pontuacao}",
                True,
                BRANCO,
            ),
            (10, 40),
        )

        tela.blit(
            fonte_pequena.render(
                f"Dinheiro: ${dinheiro}",
                True,
                VERDE,
            ),
            (10, 65),
        )

        tela.blit(
            fonte_pequena.render(
                f"Fase: {fase}",
                True,
                AZUL,
            ),
            (10, 90),
        )

    # =========================
    # LOJA
    # =========================
    elif estado == LOJA:

        titulo = titulo_fonte.render(
            "LOJA",
            True,
            AMARELO,
        )

        tela.blit(titulo, (170, 100))

        itens = [
            "1 - Velocidade (+1) = 50",
            "2 - Tiro Duplo = 80",
            "3 - Tiro Rapido = 70",
            "4 - Vida Extra = 60",
            "ESC - Voltar",
        ]

        y = 220

        for item in itens:

            texto = fonte.render(
                item,
                True,
                BRANCO,
            )

            tela.blit(texto, (90, y))

            y += 50

        dinheiro_txt = fonte.render(
            f"Dinheiro: ${dinheiro}",
            True,
            VERDE,
        )

        tela.blit(dinheiro_txt, (140, 500))

    # =========================
    # GAME OVER
    # =========================
    elif estado == GAME_OVER:

        texto = titulo_fonte.render(
            "GAME OVER",
            True,
            VERMELHO,
        )

        tela.blit(texto, (90, 250))

        score = fonte.render(
            f"Pontos: {pontuacao}",
            True,
            BRANCO,
        )

        tela.blit(score, (170, 330))

        reiniciar = fonte.render(
            "ENTER para reiniciar",
            True,
            BRANCO,
        )

        tela.blit(reiniciar, (120, 380))

    pygame.display.update()

pygame.quit()