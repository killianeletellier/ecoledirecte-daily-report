require('dotenv').config();

const moment = require('moment');
moment.locale('fr');

const nodemailer = require("nodemailer");
const { decrypt, request, homeworkParser } = require('./functions');
const mysql = require('mysql');

const connection = mysql.createConnection({
	host: process.env.dbHost,
	user: process.env.dbUser,
	password: process.env.dbPassword,
	database: process.env.dbDatabase
});

function check() {
	const minutes = new Date().getMinutes() < 9 ? '0' + new Date().getMinutes() : new Date().getMinutes();

	connection.query(`SELECT * FROM users WHERE time="${new Date().getHours()}:${minutes}";`, function (error, results, fields) {
		if (!results) return;

		results.forEach(element => {
			const password = decrypt(element.password);

			script(element.username, password, element.mail);
		});
	});
}

check();

new setInterval(() => {
	check();
}, 60000);

async function script(username, password, mail) {
	const raw_login = `data={
		"identifiant": "${username}",
	 	"motdepasse": "${password}" 
	}`;

	const login_request = await request("https://api.ecoledirecte.com/v3/login.awp", raw_login);

	if (!login_request.data) return;


	const token = login_request.token;

	const id = login_request.data.accounts[0].id;

	const raw_token = `data={
		"token": "${token}"
	}`;

	const firstname = login_request.data.accounts[0].prenom;

	const mail_request = await request(`https://api.ecoledirecte.com/v3/eleves/${id}/messages.awp?verbe=getall&orderBy=date&order=desc`, raw_token);

	const unread_mails = mail_request.data.messages.received.filter(msg => msg.read === false);
	const unread_count = unread_mails.length;

	const unread_text = [];

	if (unread_mails[0] != undefined) {
		unread_mails.forEach(mail => {
			const date_args = mail.date.split(' ');
			const day_args = date_args[0].split('-');

			const date = `reçu le ${day_args[2]}/${day_args[1]}/${day_args[0]} à ${date_args[1]}`;

			unread_text.push(`<strong>${mail.subject}</strong> - <span style='text-decoration: underline;'>${mail.from.name}</span> | ${date}`);
		});
	} else {
		unread_text.push('Aucun mail non lu !');
	}

	const agenda_request = await request(`https://api.ecoledirecte.com/v3/Eleves/${id}/cahierdetexte.awp?verbe=get`, raw_token);

	const tomorrow = moment(moment().add(1, 'd')).format('YYYY-MM-DD');
	const todo_tomorrow = agenda_request.data[tomorrow];
	const todo_tomorrow_text = [];

	if (todo_tomorrow && todo_tomorrow[0] != undefined) {
		todo_tomorrow.forEach(task => {
			const parsed = homeworkParser(task);

			todo_tomorrow_text.push(`<strong>${task.matiere.toLowerCase().charAt(0).toUpperCase() + task.matiere.toLowerCase().slice(1)}</strong>${parsed[1]} | ${parsed[0]}`);
		});
	} else {
		todo_tomorrow_text.push('Aucun devoir à faire pour demain !');
	}

	const aftertomorrow = moment(moment().add(2, 'd')).format('YYYY-MM-DD');
	const todo_aftertomorrow = agenda_request.data[aftertomorrow];
	const todo_aftertomorrow_text = [];

	if (todo_aftertomorrow && todo_aftertomorrow[0] != undefined) {
		todo_aftertomorrow.forEach(task => {
			const parsed = homeworkParser(task);

			todo_aftertomorrow_text.push(`<strong>${task.matiere.toLowerCase().charAt(0).toUpperCase() + task.matiere.toLowerCase().slice(1)}</strong>${parsed[1]} | ${parsed[0]}`);
		});
	} else {
		todo_aftertomorrow_text.push('Aucun devoir à faire pour demain !');
	}

	const grades_request = await request(`https://api.ecoledirecte.com/v3/eleves/${id}/notes.awp?verbe=get`, raw_token);

	const today_grades = grades_request.data.notes.filter(grade => grade.dateSaisie === moment().format('YYYY-MM-DD'));
	const today_grades_text = [];

	if (today_grades[0] != undefined) {
		today_grades.forEach(grade => {
			today_grades_text.push(`<span style='text-decoration: underline;'>${grade.libelleMatiere.toLowerCase().charAt(0).toUpperCase() + grade.libelleMatiere.toLowerCase().slice(1)}</span> - <strong>${grade.valeur}/${grade.noteSur}</strong> <span style='font-style: italic;'>(Min : ${grade.minClasse} | moy : ${grade.moyenneClasse} | max : ${grade.maxClasse})</span>`);
		});
	} else {
		today_grades_text.push('Aucune nouvelle note aujourd\'hui !');
	}

	let transporter = nodemailer.createTransport({
		host: process.env.mailHost,
		port: 465,
		secure: true,
		auth: {
			user: process.env.mailUser,
			pass: process.env.mailPassword
		},
	});

	await transporter.sendMail({
		from: '"EcoleDirecte 🏫" <ecole@directe.api>',
		to: mail,
		subject: "Rapport quotidien 📝",
		html: `
			<!DOCTYPE html>
			<html lang="fr">
				<head>
					<meta charset="UTF-8">

					<link href="https://fonts.googleapis.com/css?family=Quicksand" rel="stylesheet" type="text/css">

					<title>Rapport quotidien EcoleDirecte</title>
				</head>

				<body style="background-color: white; margin: 0; font-family: 'Quicksand';">
					<h1 style="text-align: center;">Rapport quotidien EcoleDirecte</h1>
					<p style="text-align: center;">
						Bonjour ${firstname}, voici le rapport quotidien EcoleDirecte du ${moment().format('LL')}.<br>
						<b>Bonne lecture !</b>
					</p>
					<br>

					<h2 class="card-title">📅 Devoirs pour le lendemain</h2>
					<hr>
					<p class="card-text">
						${todo_tomorrow_text.join('<br>')}
					</p>
					
					<h2 class="card-title">📅 Devoirs pour le surlendemain</h2>
					<hr>
					<p class="card-text">
						${todo_aftertomorrow_text.join('<br>')}
					</p>
					
					<h2 class="card-title">✉️ Mails non lus (${unread_count})</h2>
					<hr>
					<p class="card-text">
						${unread_text.join('<br>')}
					</p>
					
					<h2 class="card-title">🎖️ Nouvelles notes</h2>
					<hr>
					<p class="card-text">
						${today_grades_text.join('<br>')}
					</p>
				</body>
			</html>
		`
	});

	console.log(`Rapport d'activité quotidien envoyé à ${id} (${mail})`);
}