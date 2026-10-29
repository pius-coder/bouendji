package cm.bouendji.vpn.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.ui.COUNTRIES
import cm.bouendji.vpn.ui.Screen
import cm.bouendji.vpn.ui.ScreenColumn
import cm.bouendji.vpn.ui.ShellContext
import cm.bouendji.vpn.ui.kit.Btn
import cm.bouendji.vpn.ui.kit.BtnKind
import cm.bouendji.vpn.ui.kit.DisplayTitle
import cm.bouendji.vpn.ui.kit.Divider
import cm.bouendji.vpn.ui.kit.FinePrint
import cm.bouendji.vpn.ui.kit.FormRow
import cm.bouendji.vpn.ui.kit.Group
import cm.bouendji.vpn.ui.kit.GroupFooter
import cm.bouendji.vpn.ui.kit.GroupHeader
import cm.bouendji.vpn.ui.kit.Guil
import cm.bouendji.vpn.ui.kit.Guilloche
import cm.bouendji.vpn.ui.kit.Ic
import cm.bouendji.vpn.ui.kit.Lead
import cm.bouendji.vpn.ui.kit.ListRow
import cm.bouendji.vpn.ui.kit.Segmented
import cm.bouendji.vpn.ui.kit.Stack
import cm.bouendji.vpn.ui.kit.BlockBtn
import cm.bouendji.vpn.ui.theme.LocalTokens

@Composable
fun AuthScreen(ctx: ShellContext) {
    val c = ctx.c
    val t = LocalTokens.current
    val form = c.authForm
    Box(Modifier.fillMaxSize()) {
        // `.login-band` : vagues guillochées qui s'effacent vers le bas.
        Guilloche(
            Guil.WAVES,
            t.guilloche,
            Modifier.fillMaxWidth().height(250.dp).graphicsLayer { alpha = .9f },
        )
        Column(Modifier.statusBarsPadding()) {
            ScreenColumn {
                Column(Modifier.padding(start = 4.dp, end = 4.dp, top = 26.dp, bottom = 4.dp)) {
                    BrandIcon(64)
                    Spacer(Modifier.height(20.dp))
                    DisplayTitle("Bienvenue sur\n${BrandTokens.appName}.", size = 38.sp)
                    Spacer(Modifier.height(10.dp))
                    Lead(
                        if (form.register) "Crée ton compte avec ton numéro : ton accès s'active dès que ton paiement est confirmé."
                        else "Connecte-toi avec ton numéro de téléphone et ton mot de passe.",
                    )
                }
                Spacer(Modifier.height(14.dp))
                Segmented(
                    listOf("Inscription", "Connexion"),
                    if (form.register) 0 else 1,
                    { c.authForm = form.copy(register = it == 0); c.error = null },
                )

                if (form.register) {
                    GroupHeader("Identité et contact")
                    Group {
                        ListRow(
                            "Pays",
                            value = COUNTRIES[form.countryIndex].first,
                            chevron = true,
                            onClick = { c.sheet = "country" },
                        )
                        Divider()
                        FormRow("Nom complet", form.fullName, { c.authForm = c.authForm.copy(fullName = it) }, "Ex. Amina Ndam")
                        Divider()
                        FormRow(
                            "WhatsApp",
                            form.phone,
                            { c.authForm = c.authForm.copy(phone = it) },
                            "6XX XX XX XX",
                            KeyboardType.Phone,
                            prefix = "+${COUNTRIES[form.countryIndex].second}",
                        )
                        Divider()
                        FormRow("Mot de passe", form.password, { c.authForm = c.authForm.copy(password = it) }, "Mot de passe", KeyboardType.Password, password = true)
                    }

                    GroupHeader("Parrainage")
                    Group {
                        FormRow("Code", form.referral, { c.authForm = c.authForm.copy(referral = it.uppercase()) }, "Facultatif", mono = true)
                    }
                } else {
                    GroupHeader("Connexion")
                    Group {
                        ListRow(
                            "Pays",
                            value = COUNTRIES[form.countryIndex].first,
                            chevron = true,
                            onClick = { c.sheet = "country" },
                        )
                        Divider()
                        FormRow(
                            "Téléphone",
                            form.phone,
                            { c.authForm = c.authForm.copy(phone = it) },
                            "6XX XX XX XX",
                            KeyboardType.Phone,
                            prefix = "+${COUNTRIES[form.countryIndex].second}",
                        )
                        Divider()
                        FormRow("Mot de passe", form.password, { c.authForm = c.authForm.copy(password = it) }, "Mot de passe", KeyboardType.Password, password = true)
                    }
                }
                GroupFooter(c.error, danger = true)
                GroupFooter(if (form.register) "Ton numéro WhatsApp identifie ton compte auprès du support." else null)

                Stack {
                    BlockBtn(if (form.register) "Créer mon compte" else "Se connecter", c::authenticate, busy = c.busy)
                    BlockBtn("Voir les forfaits", { c.go(Screen.PLANS) }, kind = BtnKind.TINTED)
                }

                if (BrandTokens.communityWhatsappUrl.isNotBlank() || BrandTokens.communityTelegramUrl.isNotBlank()) {
                    GroupHeader("Communauté")
                    Group {
                        if (BrandTokens.communityWhatsappUrl.isNotBlank()) {
                            ListRow(
                                "Rejoins notre communauté WhatsApp",
                                icon = Ic.Whatsapp,
                                iconColor = Color(0xFF25D366),
                                sub = "Nouveautés et annonces du service",
                                chevron = true,
                                onClick = { c.platform.openUrl(BrandTokens.communityWhatsappUrl) },
                            )
                        }
                        if (BrandTokens.communityWhatsappUrl.isNotBlank() && BrandTokens.communityTelegramUrl.isNotBlank()) Divider(58.dp)
                        if (BrandTokens.communityTelegramUrl.isNotBlank()) {
                            ListRow(
                                "Rejoins-nous sur Telegram",
                                icon = Ic.Telegram,
                                iconColor = Color(0xFF2AABEE),
                                sub = "Astuces et annonces",
                                chevron = true,
                                onClick = { c.platform.openUrl(BrandTokens.communityTelegramUrl) },
                            )
                        }
                    }
                }
                Spacer(Modifier.height(4.dp))
                Btn("Besoin d'aide ?", ctx.openSupport, Modifier.fillMaxWidth(), kind = BtnKind.PLAIN, height = 44.dp)
                FinePrint("En continuant, tu acceptes les conditions d'utilisation du service.")
            }
        }
    }
}
