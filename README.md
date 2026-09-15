# Lernkartei

Karteikarten für den NaWi-Unterricht, direkt im Browser. Das Repo ist die
Website. Eine neu abgelegte Datei ist nach etwa zwei Minuten live.

## Eine neue Themengruppe hinzufügen

1. Den Ordner `decks/` hier auf GitHub öffnen.
2. Auf **Add file** klicken, dann auf **Upload files**.
3. Die Datei hineinziehen und auf **Commit changes** klicken.
4. Etwa zwei Minuten warten. Danach steht die neue Kachel auf der
   Startseite.

Mehr ist nicht zu tun. Die Liste der Decks entsteht von selbst.
`decks/index.json` nicht von Hand bearbeiten.

Der Name der Datei ist der Name des Speicherplatzes für den Fortschritt. Der
Titel auf der Kachel kommt dagegen aus der Datei selbst, aus dem zweiten
Argument der Karten.

## Wie die Datei aussehen muss

Als **reinen Text** speichern, mit der Endung **`.tex`**. Die Endungen `.txt`
und `.rtf` gehen auch, aber nur, wenn der Inhalt reiner Text ist.

Nicht als Rich Text speichern. Das macht zum Beispiel TextEdit auf dem Mac
ohne Nachfrage. In TextEdit hilft **Format > In reinen Text umwandeln** vor
dem Speichern. Die App meldet es, wenn eine Datei als Rich Text gespeichert
ist.

Der Inhalt bleibt genau die LaTeX-Datei, aus der auch die Papierkarten
entstehen. Jede Karte steht zweimal darin:

```latex
\frontcard{188}{Kernphysik}{Beschreibe den Aufbau eines Atoms.}
\backcard{188}{Kernphysik}{Ein Atom besteht aus kleinem Kern mit ...}
```

Die Zahl am Anfang verbindet Vorder- und Rückseite. Die Reihenfolge in der
Datei ist egal.

## Damit Formeln erscheinen

Formeln bleiben wie bisher, mit `\( ... \)` im Text und `\[ ... \]` für eine
abgesetzte Zeile. Die App zeigt sie mit KaTeX an. Chemie mit `\ce{...}`
funktioniert ebenfalls.

Eine Formel, die KaTeX nicht versteht, erscheint rot. Der Rest der Karte
bleibt lesbar.

## Wenn eine Kachel als fehlerhaft markiert ist

Auf der Kachel steht dann, was nicht stimmt. Es gibt drei Fälle:

- **Als Rich Text gespeichert.** Die Datei noch einmal als reinen Text
  speichern und erneut hochladen.
- **Keine Karten gefunden.** In der Datei fehlt `\begin{document}`, oder es
  steht kein `\frontcard` darin.
- **Datei nicht erreichbar.** Die Seite neu laden. Bleibt es dabei, ist die
  Datei nicht im Ordner `decks/` angekommen.

Fehlt einer Karte die Rückseite, verschwindet nicht das ganze Deck. Die App
zeigt beim Start einen kleinen Hinweis, und die Karte bleibt weg.

## Bedienung

Ein Tipp auf die Karte dreht sie um. Die beiden Knöpfe werden erst aktiv,
wenn die Lösung sichtbar war. Hinter dem Zahnrad steht, wie oft eine Karte
gewusst sein muss, in welcher Reihenfolge die Karten kommen und ob die
Ansicht hell oder dunkel ist.

Der Fortschritt bleibt im Browser gespeichert, auch nach dem Schließen. Die
App läuft nach dem ersten Besuch auch ohne Internet.

## Lizenzen

Im Repo liegen zwei verschiedene Werke, darum gibt es zwei Lizenzen.

- Der Programmcode steht unter der MIT-Lizenz, siehe `LICENSE`.
- Die Karteninhalte in `decks/` stehen unter CC BY-SA 4.0, siehe
  `decks/LICENSE`. Wer sie weitergibt, nennt den Urheber und gibt
  Bearbeitungen unter derselben Lizenz weiter.

Dazu kommen zwei fremde Bestandteile. KaTeX steht unter der MIT-Lizenz, siehe
`vendor/katex/LICENSE-KaTeX.txt`. Die Schrift JetBrains Mono steht unter der
SIL Open Font License 1.1, siehe `vendor/fonts/LICENSE-JetBrainsMono-OFL.txt`.
